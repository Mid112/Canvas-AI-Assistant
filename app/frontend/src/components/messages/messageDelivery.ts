export type MessageDeliveryMode = "announcement" | "private_message";

const PRIVATE_RECIPIENT_ERROR =
  "Select at least one student for a private message, or switch to a course announcement.";

export function getDeliveryAudienceError(
  deliveryMode: MessageDeliveryMode,
  selectedRecipientCount: number,
): string | null {
  return deliveryMode === "private_message" && selectedRecipientCount === 0
    ? PRIVATE_RECIPIENT_ERROR
    : null;
}
