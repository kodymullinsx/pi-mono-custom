import { Type } from "typebox";
import type { Static } from "typebox";

const ImageModeSchema = Type.Union([Type.Literal("path"), Type.Literal("base64"), Type.Literal("omit")], {
	description: "Screenshot return mode. Defaults to path.",
});

const DebugModeSchema = Type.Union([Type.Literal("none"), Type.Literal("summary"), Type.Literal("full")], {
	description: "BCU debug output mode. Defaults to none.",
});

const StateProfileSchema = Type.Union([Type.Literal("fast_visual"), Type.Literal("semantic"), Type.Literal("full_debug")], {
	description: "Optional state-read profile. Explicit fields override profile defaults.",
});

const WebTraversalSchema = Type.Union([Type.Literal("visible"), Type.Literal("full")], {
	description: "Use full only for deep WebKit/Electron parity or debugging.",
});

const MouseButtonSchema = Type.Union([Type.Literal("left"), Type.Literal("right"), Type.Literal("middle")]);

const ClickModeSchema = Type.Union([Type.Literal("single"), Type.Literal("double")]);

const ScrollDirectionSchema = Type.Union([
	Type.Literal("up"),
	Type.Literal("down"),
	Type.Literal("left"),
	Type.Literal("right"),
]);

const ScrollVerificationModeSchema = Type.Union([Type.Literal("strict"), Type.Literal("fast")]);

const FocusAssistModeSchema = Type.Union([
	Type.Literal("none"),
	Type.Literal("focus"),
	Type.Literal("focus_and_caret_end"),
]);

const CursorRequestSchema = Type.Object(
	{
		id: Type.Optional(Type.String({ description: "Stable cursor session ID." })),
		name: Type.Optional(Type.String({ description: "Short cursor label." })),
		color: Type.Optional(Type.String({ description: "CSS-style hex color." })),
	},
	{ additionalProperties: false },
);

export const BcuStatusParamsSchema = Type.Object(
	{
		debug: Type.Optional(Type.Boolean({ description: "Include extra diagnostic details in the text result." })),
	},
	{ additionalProperties: false },
);

export const BcuGetRoutesParamsSchema = Type.Object(
	{
		debug: Type.Optional(Type.Boolean({ description: "Include route notes and response fields when available." })),
	},
	{ additionalProperties: false },
);

export const BcuStartParamsSchema = Type.Object(
	{
		allowSideEffects: Type.Optional(
			Type.Boolean({
				description:
					"Allow falling back to script/start.sh, which may build/sign/install the app, create a local signing keychain, and restart BackgroundComputerUse. Defaults to BCU_AUTO_START.",
			}),
		),
		forceRestart: Type.Optional(
			Type.Boolean({
				description:
					"Allow start.sh even when a BackgroundComputerUse process already exists but the manifest/status probe is unhealthy. Defaults to false.",
			}),
		),
		appPath: Type.Optional(
			Type.String({
				description:
					"Path to an installed BackgroundComputerUse.app. Defaults to BCU_APP_PATH or ~/Applications/BackgroundComputerUse.app.",
			}),
		),
		repoPath: Type.Optional(
			Type.String({
				description:
					"Path to the background-computer-use source checkout for fallback startup. Defaults to BCU_REPO_PATH or ~/Downloads/background-computer-use.",
			}),
		),
		debug: Type.Optional(Type.Boolean({ description: "Include startup stdout/stderr tail in the result." })),
	},
	{ additionalProperties: false },
);

export const BcuListAppsParamsSchema = Type.Object(
	{
		debug: Type.Optional(Type.Boolean({ description: "Include notes from the runtime response." })),
	},
	{ additionalProperties: false },
);

export const BcuListWindowsParamsSchema = Type.Object(
	{
		app: Type.String({ description: "App name, bundle ID, or target query." }),
		debug: Type.Optional(Type.Boolean({ description: "Include notes from the runtime response." })),
	},
	{ additionalProperties: false },
);

export const BcuGetWindowStateParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		profile: Type.Optional(StateProfileSchema),
		imageMode: Type.Optional(ImageModeSchema),
		includeImage: Type.Optional(
			Type.Boolean({
				description:
					"Attach screenshot bytes as a Pi image block when available and within size limits. Defaults to false.",
			}),
		),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000, description: "AX node cap. Defaults to 6500." })),
		includeMenuBar: Type.Optional(Type.Boolean({ description: "Include menu bar state. Defaults to BCU runtime behavior." })),
		menuPath: Type.Optional(Type.Array(Type.String(), { description: "Optional menu path to open before reading state." })),
		webTraversal: Type.Optional(WebTraversalSchema),
		debugMode: Type.Optional(DebugModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include compact debug details in the adapter result." })),
		includeDiagnostics: Type.Optional(Type.Boolean()),
		includePlatformProfile: Type.Optional(Type.Boolean()),
		includeRawCapture: Type.Optional(Type.Boolean()),
		includeSemanticTree: Type.Optional(Type.Boolean()),
		includeProjectedTree: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const BcuPressKeyParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		stateToken: Type.Optional(Type.String({ description: "State token from bcu_get_window_state." })),
		key: Type.String({ description: "Key or key chord, for example command+f or return." }),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
	},
	{ additionalProperties: false },
);

export const BcuClickParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		stateToken: Type.Optional(Type.String({ description: "State token from bcu_get_window_state." })),
		elementIndex: Type.Optional(Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." })),
		x: Type.Optional(Type.Number({ description: "Model-facing screenshot x coordinate." })),
		y: Type.Optional(Type.Number({ description: "Model-facing screenshot y coordinate." })),
		mode: Type.Optional(ClickModeSchema),
		clickCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 2 })),
		mouseButton: Type.Optional(MouseButtonSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
	},
	{ additionalProperties: false },
);

export const BcuScrollParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		stateToken: Type.Optional(Type.String({ description: "State token from bcu_get_window_state." })),
		elementIndex: Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." }),
		direction: ScrollDirectionSchema,
		pages: Type.Optional(Type.Integer({ minimum: 1 })),
		verificationMode: Type.Optional(ScrollVerificationModeSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
	},
	{ additionalProperties: false },
);

export const BcuTypeTextParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		stateToken: Type.Optional(Type.String({ description: "State token from bcu_get_window_state." })),
		elementIndex: Type.Optional(Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." })),
		text: Type.String({ description: "Text to type into the focused or targeted text-entry element." }),
		focusAssistMode: Type.Optional(FocusAssistModeSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
	},
	{ additionalProperties: false },
);

export const BcuSetValueParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		stateToken: Type.Optional(Type.String({ description: "State token from bcu_get_window_state." })),
		elementIndex: Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." }),
		value: Type.String({ description: "Value to set directly on the target element." }),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
	},
	{ additionalProperties: false },
);

export const BcuPerformSecondaryActionParamsSchema = Type.Object(
	{
		window: Type.String({ description: "Stable window ID returned by bcu_list_windows." }),
		stateToken: Type.Optional(Type.String({ description: "State token from bcu_get_window_state." })),
		elementIndex: Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." }),
		action: Type.String({ description: "Exact public label from the target node's secondaryActions array." }),
		actionID: Type.Optional(Type.String({ description: "Optional stable descriptor ID from secondaryActionBindings." })),
		menuPath: Type.Optional(Type.Array(Type.String(), { description: "Optional menu path to open during the pre-action read." })),
		webTraversal: Type.Optional(WebTraversalSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
	},
	{ additionalProperties: false },
);

export type BcuStatusParams = Static<typeof BcuStatusParamsSchema>;
export type BcuGetRoutesParams = Static<typeof BcuGetRoutesParamsSchema>;
export type BcuStartParams = Static<typeof BcuStartParamsSchema>;
export type BcuListAppsParams = Static<typeof BcuListAppsParamsSchema>;
export type BcuListWindowsParams = Static<typeof BcuListWindowsParamsSchema>;
export type BcuGetWindowStateParams = Static<typeof BcuGetWindowStateParamsSchema>;
export type BcuPressKeyParams = Static<typeof BcuPressKeyParamsSchema>;
export type BcuClickParams = Static<typeof BcuClickParamsSchema>;
export type BcuScrollParams = Static<typeof BcuScrollParamsSchema>;
export type BcuTypeTextParams = Static<typeof BcuTypeTextParamsSchema>;
export type BcuSetValueParams = Static<typeof BcuSetValueParamsSchema>;
export type BcuPerformSecondaryActionParams = Static<typeof BcuPerformSecondaryActionParamsSchema>;
