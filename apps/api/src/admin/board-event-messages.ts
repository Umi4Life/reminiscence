export const BOARD_OPENED_PUBLIC_MESSAGE = "Board was opened by staff.";
export const BOARD_CLOSED_PUBLIC_MESSAGE = "Board was closed by staff.";
export const BOARD_RESET_PUBLIC_MESSAGE = "Queue was reset by staff.";

export function entryAddedPublicMessage(displayName: string): string {
  return `${displayName} joined the queue.`;
}

export function entryRemovedPublicMessage(displayName: string): string {
  return `${displayName} left the queue.`;
}
