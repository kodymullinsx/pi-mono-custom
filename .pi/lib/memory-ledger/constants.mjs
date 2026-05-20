export const EVENT_SCHEMA = "memory.event.v1";
export const FRICTION_CANDIDATE_SCHEMA = "memory.friction_candidate.v1";
export const PI_COMPACTION_PACKET_SCHEMA = "memory.pi_compaction_packet.v1";
export const PI_COMPACTION_EVENT_SCHEMA = "memory.pi_compaction_event.v1";
export const ROUTE_TELEMETRY_REPORT_SCHEMA = "memory.route_telemetry_report.v1";

export const EVENT_TYPES = [
	"route_event",
	"friction_candidate",
	"pi_compaction_packet_written",
	"pi_compaction_packet_skipped",
	"compaction_entry_written",
];

export const PI_COMPACTION_EVENT_TYPES = ["friction", "tool_failure", "decision", "open_loop"];

export const PACKET_STATUSES = ["captured", "partial"];

export const FRICTION_PATTERN_STRINGS = [
	"^\\s*no[,.!\\s]",
	"not (that|right|like that)",
	"\\bdon't\\b",
	"\\bstop\\b",
	"\\bwait\\b",
	"\\bactually\\b",
	"you missed",
	"that('s| is) wrong",
	"we already",
	"I (already )?said",
	"why did you",
	"that failed",
	"remember (this|that|to)",
	"next time",
	"for the future",
	"don't do that again",
	"you assumed",
	"not what I asked",
];

export const SECRET_PATTERN_STRINGS = [
	"sk-[A-Za-z0-9_-]{16,}",
	"\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\\b",
	"\\bgithub_pat_[A-Za-z0-9_]{20,}\\b",
	"\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b",
	"\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b",
	"\\bAuthorization\\s*[:=]\\s*Bearer\\s+[A-Za-z0-9._~+/=-]{16,}",
	"\\bBearer\\s+[A-Za-z0-9._~+/=-]{16,}",
	"\\b(api[_-]?key|token|secret|password|aws_secret_access_key)\\s*[:=]\\s*\\S+",
	"[A-Za-z][A-Za-z0-9+.-]*://[^\\s/@:]+:[^\\s/@]+@",
	"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{48,}={0,2}(?![A-Za-z0-9+/])",
];
