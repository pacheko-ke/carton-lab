import avocadoTray from "./keyline-definitions/avocadotray4kg.json";
import chickenBox from "./keyline-definitions/chickenbox.json";
import chickenBoxBottom from "./keyline-definitions/chicken-box-bottom.json";
import chickenBoxLf from "./keyline-definitions/chicken-box-lf.json";
import chickenBoxTop from "./keyline-definitions/chicken-box-top.json";
import f2 from "./keyline-definitions/f2.json";
import f2Bottom from "./keyline-definitions/f2bottom.json";
import flower from "./keyline-definitions/flower.json";
import flowerTop from "./keyline-definitions/flower-top.json";
import hangerBox from "./keyline-definitions/hangerbox.json";
import herbsBox from "./keyline-definitions/herbs-box.json";
import hangingBasin from "./keyline-definitions/hangingbasin.json";
import pizzaBoxOne from "./keyline-definitions/pizzabox-1.json";
import pizzaBox from "./keyline-definitions/pizzastandard.json";
import pf1 from "./keyline-definitions/pf1.json";
import seaFlowBottom from "./keyline-definitions/seaflowbtm.json";
import seaFlowTop from "./keyline-definitions/seaflowtop.json";
import seaFreight from "./keyline-definitions/seafreight.json";
import selfLockTray from "./keyline-definitions/selflocktray.json";
import tray from "./keyline-definitions/tray.json";

type KeylineDefinition = {
  id: string;
  name: string;
  category?: string;
  title?: string;
};

const definitions: KeylineDefinition[] = [
  flowerTop,
  flower,
  f2,
  f2Bottom,
  pf1,
  seaFlowTop,
  seaFlowBottom,
  seaFreight,
  pizzaBoxOne,
  pizzaBox,
  chickenBox,
  chickenBoxTop,
  chickenBoxBottom,
  chickenBoxLf,
  hangerBox,
  selfLockTray,
  avocadoTray,
  tray,
  herbsBox,
  hangingBasin,
];

const categoryOrder = [
  "RSC",
  "Pizza",
  "Chicken Box",
  "Flower Box",
  "Tray",
  "Sea Flow",
  "Sea Freight",
  "EPZ",
  "Other",
];
const freeCategories = new Set(["RSC", "Pizza", "Chicken Box"]);

export function keylineCategoryFor(definition: KeylineDefinition) {
  const { id, name, category } = definition;
  if (id === "rsc") return "RSC";
  if (typeof category === "string" && category.trim()) {
    const custom = category.trim();
    return (
      categoryOrder.find(
        (known) => known.toLowerCase() === custom.toLowerCase(),
      ) ?? custom
    );
  }

  const key = id.toLowerCase();
  const text = `${key} ${name.toLowerCase()}`;
  if (/pizza/.test(text)) return "Pizza";
  if (/seafreight|sea freight|freight/.test(key)) return "Sea Freight";
  if (/seaflow|sea flow/.test(key)) return "Sea Flow";
  if (/flower|pf1|f1|f2|zim/.test(text)) return "Flower Box";
  if (/tray/.test(text)) return "Tray";
  if (/seafreight|sea freight|freight/.test(text)) return "Sea Freight";
  if (/sea flow/.test(text)) return "Sea Flow";
  if (/hanger/.test(text)) return "EPZ";
  return "Other";
}

export function createKeylineCatalog(premium: boolean) {
  const available = definitions.filter(
    (definition) =>
      premium || freeCategories.has(keylineCategoryFor(definition)),
  );
  const locked = premium
    ? []
    : definitions
        .filter(
          (definition) =>
            !freeCategories.has(keylineCategoryFor(definition)),
        )
        .map((definition) => ({
          id: definition.id,
          name: definition.name,
          category: keylineCategoryFor(definition),
        }));

  return { definitions: available, locked };
}
