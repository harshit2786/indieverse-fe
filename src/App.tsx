import { HeroUIProvider } from "@heroui/react";
import BuildingPainter from "./BuildingEdit";

function App() {
  return (
    <>
      <HeroUIProvider>
        <BuildingPainter />
      </HeroUIProvider>
    </>
  );
}

export default App;
