import type { ImageContent } from "@mariozechner/pi-ai";
import { applyExifOrientation } from "./exif-orientation.js";
import { loadPhoton } from "./photon.js";

export interface ImageCropRegion {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface ImageResizeOptions {
	maxWidth?: number; // Default: 2000
	maxHeight?: number; // Default: 2000
	maxBytes?: number; // Default: 4.5MB of base64 payload (below Anthropic's 5MB limit)
	jpegQuality?: number; // Default: 80
	crop?: ImageCropRegion;
}

export interface ResizedImage {
	data: string; // base64
	mimeType: string;
	originalWidth: number;
	originalHeight: number;
	width: number;
	height: number;
	wasResized: boolean;
	crop?: ImageCropRegion;
}

// 4.5MB of base64 payload. Provides headroom below Anthropic's 5MB limit.
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024;

const DEFAULT_OPTIONS: Omit<Required<ImageResizeOptions>, "crop"> = {
	maxWidth: 2000,
	maxHeight: 2000,
	maxBytes: DEFAULT_MAX_BYTES,
	jpegQuality: 80,
};

interface EncodedCandidate {
	data: string;
	encodedSize: number;
	mimeType: string;
}

export function clipImageCropRegion(
	region: ImageCropRegion,
	imageWidth: number,
	imageHeight: number,
): ImageCropRegion | null {
	const requestedLeft = Math.floor(region.left);
	const requestedTop = Math.floor(region.top);
	const requestedRight = Math.ceil(region.left + region.width);
	const requestedBottom = Math.ceil(region.top + region.height);

	const left = Math.max(0, requestedLeft);
	const top = Math.max(0, requestedTop);
	const right = Math.min(imageWidth, requestedRight);
	const bottom = Math.min(imageHeight, requestedBottom);

	if (right <= left || bottom <= top) {
		return null;
	}

	return {
		left,
		top,
		width: right - left,
		height: bottom - top,
	};
}

export async function getImageDimensions(img: ImageContent): Promise<{ width: number; height: number } | null> {
	const photon = await loadPhoton();
	if (!photon) {
		return null;
	}

	let image: ReturnType<typeof photon.PhotonImage.new_from_byteslice> | undefined;
	try {
		const inputBuffer = Buffer.from(img.data, "base64");
		const inputBytes = new Uint8Array(inputBuffer);
		const rawImage = photon.PhotonImage.new_from_byteslice(inputBytes);
		image = applyExifOrientation(photon, rawImage, inputBytes);
		if (image !== rawImage) rawImage.free();
		return {
			width: image.get_width(),
			height: image.get_height(),
		};
	} catch {
		return null;
	} finally {
		if (image) {
			image.free();
		}
	}
}

function encodeCandidate(buffer: Uint8Array, mimeType: string): EncodedCandidate {
	const data = Buffer.from(buffer).toString("base64");
	return {
		data,
		encodedSize: Buffer.byteLength(data, "utf-8"),
		mimeType,
	};
}

/**
 * Resize an image to fit within the specified max dimensions and encoded file size.
 * Returns null if the image cannot be resized below maxBytes.
 *
 * Uses Photon (Rust/WASM) for image processing. If Photon is not available,
 * returns null.
 *
 * Strategy for staying under maxBytes:
 * 1. First resize to maxWidth/maxHeight
 * 2. Try both PNG and JPEG formats, pick the smaller one
 * 3. If still too large, try JPEG with decreasing quality
 * 4. If still too large, progressively reduce dimensions until 1x1
 */
export async function resizeImage(img: ImageContent, options?: ImageResizeOptions): Promise<ResizedImage | null> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const inputBuffer = Buffer.from(img.data, "base64");
	const inputBase64Size = Buffer.byteLength(img.data, "utf-8");

	const photon = await loadPhoton();
	if (!photon) {
		return null;
	}

	let image: ReturnType<typeof photon.PhotonImage.new_from_byteslice> | undefined;
	let workingImage: ReturnType<typeof photon.PhotonImage.new_from_byteslice> | undefined;
	try {
		const inputBytes = new Uint8Array(inputBuffer);
		const rawImage = photon.PhotonImage.new_from_byteslice(inputBytes);
		image = applyExifOrientation(photon, rawImage, inputBytes);
		if (image !== rawImage) rawImage.free();

		const originalWidth = image.get_width();
		const originalHeight = image.get_height();
		const format = img.mimeType?.split("/")[1] ?? "png";
		let crop: ImageCropRegion | undefined;
		workingImage = image;

		if (opts.crop) {
			const normalizedCrop = clipImageCropRegion(opts.crop, originalWidth, originalHeight);
			if (!normalizedCrop) {
				return null;
			}
			workingImage = photon.crop(
				image,
				normalizedCrop.left,
				normalizedCrop.top,
				normalizedCrop.left + normalizedCrop.width,
				normalizedCrop.top + normalizedCrop.height,
			);
			crop = normalizedCrop;
		}

		const sourceWidth = workingImage.get_width();
		const sourceHeight = workingImage.get_height();

		// Check if already within all limits (dimensions AND encoded size)
		if (
			!crop &&
			originalWidth <= opts.maxWidth &&
			originalHeight <= opts.maxHeight &&
			inputBase64Size < opts.maxBytes
		) {
			return {
				data: img.data,
				mimeType: img.mimeType ?? `image/${format}`,
				originalWidth,
				originalHeight,
				width: originalWidth,
				height: originalHeight,
				wasResized: false,
			};
		}

		// Calculate initial dimensions respecting max limits
		let targetWidth = sourceWidth;
		let targetHeight = sourceHeight;

		if (targetWidth > opts.maxWidth) {
			targetHeight = Math.round((targetHeight * opts.maxWidth) / targetWidth);
			targetWidth = opts.maxWidth;
		}
		if (targetHeight > opts.maxHeight) {
			targetWidth = Math.round((targetWidth * opts.maxHeight) / targetHeight);
			targetHeight = opts.maxHeight;
		}

		function tryEncodings(width: number, height: number, jpegQualities: number[]): EncodedCandidate[] {
			const resized = photon!.resize(workingImage!, width, height, photon!.SamplingFilter.Lanczos3);

			try {
				const candidates: EncodedCandidate[] = [encodeCandidate(resized.get_bytes(), "image/png")];
				for (const quality of jpegQualities) {
					candidates.push(encodeCandidate(resized.get_bytes_jpeg(quality), "image/jpeg"));
				}
				return candidates;
			} finally {
				resized.free();
			}
		}

		const qualitySteps = Array.from(new Set([opts.jpegQuality, 85, 70, 55, 40]));
		let currentWidth = targetWidth;
		let currentHeight = targetHeight;

		while (true) {
			const candidates = tryEncodings(currentWidth, currentHeight, qualitySteps);
			for (const candidate of candidates) {
				if (candidate.encodedSize < opts.maxBytes) {
					return {
						data: candidate.data,
						mimeType: candidate.mimeType,
						originalWidth,
						originalHeight,
						width: currentWidth,
						height: currentHeight,
						wasResized: crop ? currentWidth !== originalWidth || currentHeight !== originalHeight : true,
						crop,
					};
				}
			}

			if (currentWidth === 1 && currentHeight === 1) {
				break;
			}

			const nextWidth = currentWidth === 1 ? 1 : Math.max(1, Math.floor(currentWidth * 0.75));
			const nextHeight = currentHeight === 1 ? 1 : Math.max(1, Math.floor(currentHeight * 0.75));
			if (nextWidth === currentWidth && nextHeight === currentHeight) {
				break;
			}

			currentWidth = nextWidth;
			currentHeight = nextHeight;
		}

		return null;
	} catch {
		return null;
	} finally {
		if (workingImage && workingImage !== image) {
			workingImage.free();
		}
		if (image) {
			image.free();
		}
	}
}

/**
 * Format a dimension note for resized images.
 * This helps the model understand the coordinate mapping.
 */
export function formatDimensionNote(
	result: ResizedImage,
	options?: {
		includeOriginalDimensions?: boolean;
	},
): string | undefined {
	if (result.crop) {
		const scale = result.crop.width / result.width;
		return `[Image crop from original ${result.originalWidth}x${result.originalHeight}: left=${result.crop.left}, top=${result.crop.top}, width=${result.crop.width}, height=${result.crop.height}. Displayed at ${result.width}x${result.height}. Multiply displayed coordinates by ${scale.toFixed(2)} and offset by (${result.crop.left}, ${result.crop.top}) to map to the original image.]`;
	}

	if (!result.wasResized && !options?.includeOriginalDimensions) {
		return undefined;
	}

	if (!result.wasResized) {
		return `[Image dimensions: ${result.originalWidth}x${result.originalHeight}. Coordinates map directly to the original image.]`;
	}

	const scale = result.originalWidth / result.width;
	return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}
