import { useState } from "react";
import LocalApp from "./LocalApp.tsx";
import { OnlineApp } from "./OnlineApp.tsx";

export default function App() {
  const [experience, setExperience] = useState<"LOCAL" | "ONLINE">("LOCAL");
  return <>
    <div className="brand-banner">
      <img src="/domino3d-orpira-brand.png" alt="Domino3D-OrPiRa: dos fichas, órbita dorada y símbolo pi" />
      <span><strong>Domino3D-OrPiRa</strong><small>Dominó visual 3D</small></span>
    </div>
    <div className="experience-switch" role="navigation" aria-label="Tipo de partida">
      <button className={experience === "LOCAL" ? "current" : ""} onClick={() => setExperience("LOCAL")}>Partida local</button>
      <button className={experience === "ONLINE" ? "current" : ""} onClick={() => setExperience("ONLINE")}>Partida online</button>
    </div>
    {experience === "LOCAL" ? <LocalApp /> : <OnlineApp />}
  </>;
}
