import { Type } from "typebox";
import type { Static } from "typebox";

const ImageModeSchema = Type.Union([Type.Literal("path"), Type.Literal("base64"), Type.Literal("omit")], {
	description: "Screenshot return mode. Defaults to base64.",
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

const ResizeHandleSchema = Type.Union(
	[
		Type.Literal("n"),
		Type.Literal("s"),
		Type.Literal("e"),
		Type.Literal("w"),
		Type.Literal("ne"),
		Type.Literal("nw"),
		Type.Literal("se"),
		Type.Literal("sw"),
	],
	{ description: "Window resize handle name. The sidecar's resize uses point-coordinate semantics: drag the named handle to (toX, toY)." },
);

const BcuWindowRefFields = {
	windowRef: Type.Optional(
		Type.String({
				description:
					"Window ref (for example '@w1') from the current Pi session and latest successful bcu_capture. Provide exactly one of window or windowRef.",
		}),
	),
};

const BcuRefFields = {
	...BcuWindowRefFields,
	elementRef: Type.Optional(
		Type.String({
			description:
				"Element ref (for example '@e3') from the latest bcu_capture. Preferred over `elementIndex` when the ref is in the current ref map.",
		}),
	),
};

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

export const BcuCaptureParamsSchema = Type.Object(
	{
		app: Type.String({ description: "App name, bundle ID, or target query for bcu_list_windows." }),
		windowTitle: Type.Optional(
			Type.String({ description: "Optional substring match against the window title." }),
		),
		profile: Type.Optional(
			Type.Union(
				[
					Type.Literal("fast_visual"),
					Type.Literal("semantic"),
					Type.Literal("full_debug"),
				],
				{ description: "State-read profile. Defaults to 'semantic' for permission tolerance." },
			),
		),
		imageMode: Type.Optional(ImageModeSchema),
		includeImage: Type.Optional(
			Type.Boolean({
				description:
					"Attach screenshot bytes as a Pi image block when available and within size limits. Defaults to false.",
			}),
		),
		maxNodes: Type.Optional(
			Type.Integer({ minimum: 1, maximum: 20000, description: "AX node cap. Defaults to 500." }),
		),
	},
	{ additionalProperties: false },
);

export const BcuMoveWindowParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		toX: Type.Number({ description: "Model-facing target x coordinate for the window's top-left." }),
		toY: Type.Number({ description: "Model-facing target y coordinate for the window's top-left." }),
		cursor: Type.Optional(CursorRequestSchema),
		...BcuRefFields,
	},
	{ additionalProperties: false },
);

export const BcuSetWindowFrameParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		x: Type.Number({ description: "Model-facing target x coordinate for the window's top-left." }),
		y: Type.Number({ description: "Model-facing target y coordinate for the window's top-left." }),
		width: Type.Number({ description: "Target width in model-facing screenshot pixels." }),
		height: Type.Number({ description: "Target height in model-facing screenshot pixels." }),
		animate: Type.Optional(Type.Boolean({ description: "Animate the frame change when supported. Defaults to false." })),
		cursor: Type.Optional(CursorRequestSchema),
		...BcuRefFields,
	},
	{ additionalProperties: false },
);

export const BcuResizeParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		handle: ResizeHandleSchema,
		toX: Type.Number({ description: "Model-facing target x coordinate for the dragged handle." }),
		toY: Type.Number({ description: "Model-facing target y coordinate for the dragged handle." }),
		cursor: Type.Optional(CursorRequestSchema),
		...BcuRefFields,
	},
	{ additionalProperties: false },
);

const BcuBatchActionBase = {
	cursor: Type.Optional(CursorRequestSchema),
};

const BcuBatchPressKeyAction = Type.Object(
	{
		type: Type.Literal("press_key"),
		key: Type.String({ description: "Key or key chord." }),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchClickAction = Type.Object(
	{
		type: Type.Literal("click"),
		elementIndex: Type.Optional(Type.Integer({ minimum: 0 })),
		x: Type.Optional(Type.Number()),
		y: Type.Optional(Type.Number()),
		mode: Type.Optional(ClickModeSchema),
		clickCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 2 })),
		mouseButton: Type.Optional(MouseButtonSchema),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchScrollAction = Type.Object(
	{
		type: Type.Literal("scroll"),
		elementIndex: Type.Integer({ minimum: 0 }),
		direction: ScrollDirectionSchema,
		pages: Type.Optional(Type.Integer({ minimum: 1 })),
		verificationMode: Type.Optional(ScrollVerificationModeSchema),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchTypeTextAction = Type.Object(
	{
		type: Type.Literal("type_text"),
		text: Type.String(),
		elementIndex: Type.Optional(Type.Integer({ minimum: 0 })),
		focusAssistMode: Type.Optional(FocusAssistModeSchema),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchSetValueAction = Type.Object(
	{
		type: Type.Literal("set_value"),
		elementIndex: Type.Integer({ minimum: 0 }),
		value: Type.String(),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchMoveWindowAction = Type.Object(
	{
		type: Type.Literal("move_window"),
		toX: Type.Number(),
		toY: Type.Number(),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchSetWindowFrameAction = Type.Object(
	{
		type: Type.Literal("set_window_frame"),
		x: Type.Number(),
		y: Type.Number(),
		width: Type.Number(),
		height: Type.Number(),
		animate: Type.Optional(Type.Boolean()),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

const BcuBatchResizeAction = Type.Object(
	{
		type: Type.Literal("resize"),
		handle: ResizeHandleSchema,
		toX: Type.Number(),
		toY: Type.Number(),
		...BcuBatchActionBase,
	},
	{ additionalProperties: false },
);

export const BcuBatchActionSchema = Type.Union(
	[
		BcuBatchPressKeyAction,
		BcuBatchClickAction,
		BcuBatchScrollAction,
		BcuBatchTypeTextAction,
		BcuBatchSetValueAction,
		BcuBatchMoveWindowAction,
		BcuBatchSetWindowFrameAction,
		BcuBatchResizeAction,
	],
	{ description: "Discriminated union of action shapes. Each action includes a `type` discriminator." },
);

export const BcuComputerActionsParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID. Provide exactly one of window or windowRef." })),
		windowRef: BcuRefFields.windowRef,
		stateToken: Type.String({ description: "Current state token from the latest state read. Stale tokens are rejected with a validation result." }),
		actions: Type.Array(BcuBatchActionSchema, {
			minItems: 1,
			maxItems: 20,
			description:
				"1-20 actions to execute in order. The 20-action cap is derived from the 30s action-lock TTL plus a 1s per-action budget, not copied from a comparison.",
		}),
		cursor: Type.Optional(CursorRequestSchema),
		includeFinalState: Type.Optional(
			Type.Boolean({
				description: "Read state once after the batch completes. Defaults to true.",
			}),
		),
	},
	{ additionalProperties: false },
);

export const BcuPressKeyParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		key: Type.String({ description: "Key or key chord, for example command+f or return." }),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
		...BcuRefFields,
	},
	{ additionalProperties: false },
);

export const BcuClickParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
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
		...BcuRefFields,
	},
	{ additionalProperties: false },
);

const BcuScrollCommonFields = {
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		direction: ScrollDirectionSchema,
		pages: Type.Optional(Type.Integer({ minimum: 1 })),
		verificationMode: Type.Optional(ScrollVerificationModeSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
		...BcuWindowRefFields,
};

export const BcuScrollParamsSchema = Type.Union([
	Type.Object(
		{ ...BcuScrollCommonFields, elementIndex: Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." }), elementRef: Type.Optional(Type.Never()) },
		{ additionalProperties: false },
	),
	Type.Object(
		{ ...BcuScrollCommonFields, elementIndex: Type.Optional(Type.Never()), elementRef: Type.String({ description: "Element ref from the latest successful bcu_capture." }) },
		{ additionalProperties: false },
	),
]);

export const BcuTypeTextParamsSchema = Type.Object(
	{
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		elementIndex: Type.Optional(Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." })),
		text: Type.String({ description: "Text to type into the focused or targeted text-entry element." }),
		focusAssistMode: Type.Optional(FocusAssistModeSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
		...BcuRefFields,
	},
	{ additionalProperties: false },
);

const BcuSetValueCommonFields = {
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		value: Type.String({ description: "Value to set directly on the target element." }),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
		...BcuWindowRefFields,
};

export const BcuSetValueParamsSchema = Type.Union([
	Type.Object(
		{ ...BcuSetValueCommonFields, elementIndex: Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." }), elementRef: Type.Optional(Type.Never()) },
		{ additionalProperties: false },
	),
	Type.Object(
		{ ...BcuSetValueCommonFields, elementIndex: Type.Optional(Type.Never()), elementRef: Type.String({ description: "Element ref from the latest successful bcu_capture." }) },
		{ additionalProperties: false },
	),
]);

const BcuSecondaryActionCommonFields = {
		window: Type.Optional(Type.String({ description: "Stable window ID returned by bcu_list_windows. Provide exactly one of window or windowRef." })),
		stateToken: Type.String({ description: "Fresh, unused state token from the current Pi session's latest state read." }),
		action: Type.String({ description: "Exact public label from the target node's secondaryActions array." }),
		actionID: Type.Optional(Type.String({ description: "Optional stable descriptor ID from secondaryActionBindings." })),
		menuPath: Type.Optional(Type.Array(Type.String(), { description: "Optional menu path to open during the pre-action read." })),
		webTraversal: Type.Optional(WebTraversalSchema),
		cursor: Type.Optional(CursorRequestSchema),
		includeMenuBar: Type.Optional(Type.Boolean()),
		maxNodes: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })),
		imageMode: Type.Optional(ImageModeSchema),
		debug: Type.Optional(Type.Boolean({ description: "Include verbose runtime action notes when available." })),
		...BcuWindowRefFields,
};

export const BcuPerformSecondaryActionParamsSchema = Type.Union([
	Type.Object(
		{ ...BcuSecondaryActionCommonFields, elementIndex: Type.Integer({ minimum: 0, description: "Element index from bcu_get_window_state." }), elementRef: Type.Optional(Type.Never()) },
		{ additionalProperties: false },
	),
	Type.Object(
		{ ...BcuSecondaryActionCommonFields, elementIndex: Type.Optional(Type.Never()), elementRef: Type.String({ description: "Element ref from the latest successful bcu_capture." }) },
		{ additionalProperties: false },
	),
]);

export type BcuStatusParams = Static<typeof BcuStatusParamsSchema>;
export type BcuGetRoutesParams = Static<typeof BcuGetRoutesParamsSchema>;
export type BcuListAppsParams = Static<typeof BcuListAppsParamsSchema>;
export type BcuListWindowsParams = Static<typeof BcuListWindowsParamsSchema>;
export type BcuGetWindowStateParams = Static<typeof BcuGetWindowStateParamsSchema>;
export type BcuCaptureParams = Static<typeof BcuCaptureParamsSchema>;
export type BcuMoveWindowParams = Static<typeof BcuMoveWindowParamsSchema>;
export type BcuSetWindowFrameParams = Static<typeof BcuSetWindowFrameParamsSchema>;
export type BcuResizeParams = Static<typeof BcuResizeParamsSchema>;
export type BcuBatchAction = Static<typeof BcuBatchActionSchema>;
export type BcuComputerActionsParams = Static<typeof BcuComputerActionsParamsSchema>;
export type BcuPressKeyParams = Static<typeof BcuPressKeyParamsSchema>;
export type BcuClickParams = Static<typeof BcuClickParamsSchema>;
export type BcuScrollParams = Static<typeof BcuScrollParamsSchema>;
export type BcuTypeTextParams = Static<typeof BcuTypeTextParamsSchema>;
export type BcuSetValueParams = Static<typeof BcuSetValueParamsSchema>;
export type BcuPerformSecondaryActionParams = Static<typeof BcuPerformSecondaryActionParamsSchema>;
