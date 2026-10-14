"use client";

// Slow-drifting colour orbs — gives the hero life without touching the base bg.
export function Blobs() {
  return (
    <>
      <div
        className="pointer-events-none absolute -left-40 top-4 h-[26rem] w-[26rem] rounded-full bg-vermilion/30 blur-[130px]"
        style={{ animation: "float-a 16s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 h-[22rem] w-[22rem] rounded-full bg-teal/35 blur-[130px]"
        style={{ animation: "float-b 20s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute left-1/3 top-1/2 h-64 w-64 rounded-full bg-[#e0a53a]/20 blur-[120px]"
        style={{ animation: "float-a 24s ease-in-out infinite" }}
      />
    </>
  );
}
