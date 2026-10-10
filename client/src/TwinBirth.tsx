import { useState } from "react";
import { api } from "./api";

interface Twin {
  name: string;
  imageBlobKey: string;
  compositionJson: string;
  flavorText: string;
}

export default function TwinBirth({
  twin,
  sessionId,
  onClaimed,
}: {
  twin: Twin;
  sessionId: number;
  onClaimed: () => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const claim = async () => {
    setClaiming(true);
    try {
      await api.claimConfluenceTwin({ sessionId });
      setClaimed(true);
      setTimeout(onClaimed, 2000);
    } catch (e) {
      console.error("Twin claim failed", e);
      setClaiming(false);
    }
  };

  // Image URL from blob key — construct like other images
  const imageUrl = `/api/blob/${twin.imageBlobKey}`;

  return (
    <div className="twin-birth-overlay">
      <div className="twin-birth">
        <div className="twin-birth-header">
          <span className="twin-birth-eyebrow">✦ A twin stirs ✦</span>
          <h2>Victory Birth</h2>
        </div>
        <div className="twin-birth-body">
          <img src={imageUrl} alt={twin.name} className="twin-birth-image" />
          <div className="twin-birth-name">{twin.name}</div>
          <div className="twin-birth-flavor">"{twin.flavorText}"</div>
          <div className="twin-birth-lore">
            Born of confluence — when two tenders stood together against the Unraveling,
            this one was conceived. Identical twins now exist: one for each tender's bloodline.
          </div>
        </div>
        {!claimed ? (
          <button className="abtn twin-claim" onClick={claim} disabled={claiming}>
            {claiming ? "Gathering..." : "✦ Add to deck"}
          </button>
        ) : (
          <div className="twin-claimed">✦ Welcomed into your deck ✦</div>
        )}
      </div>
    </div>
  );
}
