// Shared birth logic for field-born Awoken.
// Generates a new Awoken from the Layer Pools (not a clone).

export interface BirthLayers {
  sourceId: string;
  name: string;
  category: string;
  rarity: string;
  power: number | null;
  toughness: number | null;
  imageUrl: string;
}

export function pickBirthLayers(
  assets: BirthLayers[],
  teamElements?: string[]
): BirthLayers[] {
  // Pick one body, one arms, one head. Weighted by rarity (common more likely).
  // If teamElements provided, bias toward those elements (future: elemental tags).
  const pick = (category: string): BirthLayers | null => {
    const pool = assets.filter(a => a.category === category);
    if (pool.length === 0) return null;
    // Simple weighted: shuffle and pick (rarity weighting done by pool composition)
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const body = pick("body");
  const arms = pick("arms");
  const head = pick("head");
  const aura = pick("aura");

  const layers: BirthLayers[] = [];
  if (body) layers.push(body);
  if (arms) layers.push(arms);
  if (aura) layers.push(aura);
  if (head) layers.push(head);

  // 5% fire chance: if fire pieces exist, swap one layer for fire
  const firePieces = assets.filter(a => a.category !== "background" && (a as any).element === "fire");
  if (firePieces.length > 0 && Math.random() < 0.05) {
    const firePiece = firePieces[Math.floor(Math.random() * firePieces.length)];
    // Replace the layer of the same category
    const idx = layers.findIndex(l => l.category === firePiece.category);
    if (idx >= 0) layers[idx] = firePiece as BirthLayers;
  }

  return layers;
}

export function liberationStory(liberatorNames: string[]): string {
  const names = liberatorNames.join(", ");
  return `Liberated by ${names}. When the dark broke over this tile, I opened my eyes on reclaimed land. They stood over me — the ones who fought the Unraveler back. This is where I began, on ground they made safe.`;
}

// Compose layers to a data URL (for the card image).
// Draws back-to-front: body → arms → aura → head (no background).
export async function composeBirth(layers: BirthLayers[]): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 750; canvas.height = 971;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  const order = ["body", "arms", "aura", "head"];
  const ordered = [...layers].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  for (const layer of ordered) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = layer.imageUrl;
    });
    ctx.drawImage(img, 0, 0, 750, 971);
  }
  return canvas.toDataURL("image/png");
}
