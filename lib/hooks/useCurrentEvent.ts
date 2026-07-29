import { useEventContext } from "@/components/providers/EventProvider";

/**
 * Thin hook — returns the EventContext value.
 * Import from here to keep pages independent of the provider import path.
 */
export function useCurrentEvent() {
  return useEventContext();
}
