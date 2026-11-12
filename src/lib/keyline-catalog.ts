import avocadoTray from "./keyline-definitions/avocadotray4kg.json";
import chickenBox from "./keyline-definitions/chickenbox.json";
import chickenBoxBottom from "./keyline-definitions/chicken-box-bottom.json";
import chickenBoxLf from "./keyline-definitions/chicken-box-lf.json";
import chickenBoxTop from "./keyline-definitions/chicken-box-top.json";
import f2 from "./keyline-definitions/f2.json";
import f2Bottom from "./keyline-definitions/f2bottom.json";
import fefco0203 from "./keyline-definitions/fefco0203.json";
import fefco0215 from "./keyline-definitions/fefco-0215.json";
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
  fefco0203,
  fefco0215,
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
  "Slotted Boxes",
  "Flower",
  "Tray",
  "Auto-Bottom",
  "Apparel",
  "Other",
];
const freeCategories = new Set(["RSC", "Pizza", "Chicken Box"]);

export function keylineCategoryFor(definition: KeylineDefinition) {
  const { id, name, category } = definition;
  if (id === "rsc") return "RSC";
  if (/fefco/.test(`${id} ${name}`.toLowerCase())) return "Slotted Boxes";

  const normalizedCategory = typeof category === "string" ? category.trim() : "";
  if (
    normalizedCategory &&
    normalizedCategory.toLowerCase() !== "other"
  ) {
    if (
      ["flower box", "sea flow", "sea freight"].includes(
        normalizedCategory.toLowerCase(),
      )
    ) {
      return "Flower";
    }
    if (normalizedCategory.toLowerCase() === "epz") return "Apparel";
    const custom = normalizedCategory;
    return (
      categoryOrder.find(
        (known) => known.toLowerCase() === custom.toLowerCase(),
      ) ?? custom
    );
  }

  const key = id.toLowerCase();
  const text = `${key} ${name.toLowerCase()}`;
  if (/pizza/.test(text)) return "Pizza";
  if (/auto.?bottom/.test(text)) return "Auto-Bottom";
  if (
    /flower|pf1|f1|f2|zim|seafreight|sea freight|freight|seaflow|sea flow/.test(
      text,
    )
  ) {
    return "Flower";
  }
  if (/tray/.test(text)) return "Tray";
  if (/hanger/.test(text)) return "Apparel";
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
