import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/** Workshop music library: upload, preview, enable/disable battle tracks. */
export default function MusicLibrary() {
  const query = useQuery({ queryKey: ["battleTracks"], queryFn: () => api.listBattleTracks() });
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const doAction = async (fn: () => Promise<any>, label: string) => {
    try { await fn(); setMsg(label); query.refetch(); setTimeout(() => setMsg(null), 2500); }
    catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  const stopPlaying = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    // Stop 8-bit tracks too
    import("./trackPlayer").then(({ trackPlayer }) => trackPlayer.stop()).catch(() => {});
    setPlayingId(null);
  };

  const skipTrack = async (direction: 1 | -1) => {
    const tracks = query.data?.tracks ?? [];
    if (!tracks.length) return;
    const currentIdx = tracks.findIndex(t => t.id === playingId);
    const nextIdx = currentIdx === -1
      ? (direction === 1 ? 0 : tracks.length - 1)
      : (currentIdx + direction + tracks.length) % tracks.length;
    await playTrack(tracks[nextIdx].id);
  };

  const playTrack = async (id: number) => {
    if (playingId === id) { stopPlaying(); return; }
    stopPlaying();
    try {
      const { trackData } = await api.getBattleTrack({ id });
      if (trackData.startsWith("data:audio") || trackData.startsWith("/music/")) {
        const audio = new Audio(trackData);
        audio.volume = 0.7;
        audioRef.current = audio;
        setPlayingId(id);
        audio.onended = () => setPlayingId(null);
        await audio.play();
      } else {
        const { trackPlayer } = await import("./trackPlayer");
        trackPlayer.play(JSON.parse(trackData));
        setPlayingId(id);
        // 8-bit tracks play through the chiptune engine; stop on toggle
      }
    } catch (e) {
      setMsg("Couldn't play: " + (e as Error).message);
    }
  };

  const uploadFile = async (file: File) => {
    if (!name.trim()) { setMsg("Enter a track name first."); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.addBattleTrack({ name: name.trim(), trackData: dataUrl });
      setName(""); setMsg(`"${file.name}" added to the library.`);
      query.refetch();
      setTimeout(() => setMsg(null), 2500);
    } catch (e) { setMsg("Upload failed: " + (e as Error).message); }
    setUploading(false);
  };

  if (query.isPending) return <p className="quiet">Loading music library…</p>;
  if (query.error) return <p className="notice error">Couldn't load tracks.</p>;
  const tracks = query.data?.tracks ?? [];

  return (
    <section className="music-library">
      <header>
        <p className="eyebrow">Music Library</p>
        <h1>Songs of the Unraveling.</h1>
        <p className="quiet">
          Enabled tracks play at random when a battle begins. Upload any audio file —
          MP3, WAV, OGG, M4A — or add 8-bit compositions below.
        </p>
      </header>
      {msg && <p className="notice">{msg}</p>}

      <div className="music-upload">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Track name"
          className="music-name-input"
        />
        <label className="abtn music-upload-btn">
          {uploading ? "Uploading…" : "⬆ Upload audio"}
          <input
            type="file"
            accept="audio/*"
            hidden
            disabled={uploading}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {!tracks.length ? (
        <p className="quiet">The library is empty. Upload your first track above.</p>
      ) : (
        <ol className="music-track-list">
          {tracks.map(t => (
            <li key={t.id} className={`music-track ${playingId === t.id ? "playing" : ""}`}>
              <div className="music-controls">
                <button
                  className="music-skip-btn"
                  onClick={() => skipTrack(-1)}
                  title="Previous track"
                >
                  ⏮
                </button>
                <button
                  className="music-play-btn"
                  onClick={() => playTrack(t.id)}
                  title={playingId === t.id ? "Stop" : "Play"}
                >
                  {playingId === t.id ? "⏸" : "▶"}
                </button>
                <button
                  className="music-skip-btn"
                  onClick={() => skipTrack(1)}
                  title="Next track"
                >
                  ⏭
                </button>
              </div>
              <div className="music-track-info">
                <strong>{t.name}</strong>
                <small>{t.enabled ? "✓ in battle rotation" : "○ disabled"}</small>
              </div>
              <div className="music-track-actions">
                <button
                  className="abtn small"
                  onClick={() => doAction(
                    () => api.toggleBattleTrack({ id: t.id, enabled: !t.enabled }),
                    t.enabled ? "Removed from rotation" : "Added to rotation"
                  )}
                  title={t.enabled ? "Disable" : "Enable"}
                >
                  {t.enabled ? "○" : "✓"}
                </button>
                <button
                  className="abtn small danger"
                  onClick={() => {
                    if (playingId === t.id) stopPlaying();
                    if (confirm(`Delete "${t.name}"?`)) doAction(() => api.deleteBattleTrack({ id: t.id }), "Deleted");
                  }}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
