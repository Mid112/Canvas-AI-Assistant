export interface Institution {
  id: string;
  name: string;
  shortName: string;
  /** Canvas host for this institution when derived from a saved connection. */
  canvasUrl?: string;
}

