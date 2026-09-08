import Ionicons from "@expo/vector-icons/Ionicons";

export type RequestStatus = "requested" | "processing" | "ready" | "released";

// "released" is the DB/status-machine name (matches document_requests'
// status column and NEXT_STATUS below), but the UI calls the terminal
// state "Received" - that's a display-only relabel, not a schema change.
export const STATUS_STYLE: Record<
  RequestStatus,
  {
    label: string;
    color: string;
    background: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  requested: {
    label: "Requested",
    color: "#6b7280",
    background: "#f0f0f3",
    icon: "time-outline",
  },
  processing: {
    label: "Processing",
    color: "#d97706",
    background: "#fef3e2",
    icon: "sync-outline",
  },
  ready: {
    label: "Ready",
    color: "#059669",
    background: "#e3f9ee",
    icon: "cube-outline",
  },
  released: {
    label: "Received",
    color: "#0d9488",
    background: "#e0f5f1",
    icon: "checkmark-circle-outline",
  },
};

// Tap-to-advance: each request has one obvious "next step". `released` is
// terminal - no further advance action is offered for it.
export const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  requested: "processing",
  processing: "ready",
  ready: "released",
  released: null,
};

// document_requests has no icon/color column of its own, so each request's
// badge color just cycles through a fixed palette by position - same
// approach the Documents grid used before its per-document color override
// existed.
export const REQUEST_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
];

// Best-effort icon guess from the free-text document_type field, since
// there's no category column to key off of. Falls back to a generic
// document icon for anything that doesn't match a known keyword.
export function iconForRequestType(
  documentType: string,
): keyof typeof Ionicons.glyphMap {
  const type = documentType.toLowerCase();
  if (type.includes("transcript") || type.includes("grade")) {
    return "book-outline";
  }
  if (type.includes("enrollment")) return "clipboard-outline";
  if (type.includes("diploma")) return "ribbon-outline";
  if (type.includes(" id") || type.startsWith("id")) return "card-outline";
  return "document-text-outline";
}
