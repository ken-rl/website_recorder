import { useEffect, useRef, useState } from "react";
import { Player } from "@lordicon/react";

const iconCache = new Map<string, object>();

interface LordIconProps {
  src: string;
  size?: number;
  trigger?: "hover" | "loop";
  colors?: string;
  className?: string;
  title?: string;
}

export default function LordIcon({
  src,
  size = 22,
  trigger = "hover",
  colors = "primary:#f4f4f5,secondary:#71717a",
  className = "",
  title,
}: LordIconProps) {
  const [iconData, setIconData] = useState<object | null>(
    () => iconCache.get(src) ?? null,
  );
  const playerRef = useRef<Player>(null);

  useEffect(() => {
    if (iconCache.has(src)) {
      setIconData(iconCache.get(src)!);
      return;
    }

    let cancelled = false;
    fetch(src)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          iconCache.set(src, data);
          setIconData(data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!iconData || trigger !== "loop") return;
    playerRef.current?.playFromBeginning();
  }, [iconData, trigger]);

  if (!iconData) {
    return (
      <span
        className={`lord-icon lord-icon-placeholder ${className}`}
        style={{ width: size, height: size }}
        title={title}
      />
    );
  }

  return (
    <span
      className={`lord-icon ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => {
        if (trigger === "hover") {
          playerRef.current?.playFromBeginning();
        }
      }}
      title={title}
    >
      <Player ref={playerRef} icon={iconData} size={size} colors={colors} />
    </span>
  );
}