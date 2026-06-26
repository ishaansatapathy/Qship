import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 18,
          background: "#000000",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#e31e24",
          fontWeight: 800,
          fontStyle: "italic",
          border: "2px solid #e31e24",
          borderRadius: 8,
        }}
      >
        Q
      </div>
    ),
    { ...size },
  );
}
