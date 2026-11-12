import avocadoTray from "./keyline-definitions/avocadotray4kg.json";
import chickenBox from "./keyline-definitions/chickenbox.json";
import chickenBoxBottom from "./keyline-definitions/chicken-box-bottom.json";
import chickenBoxLf from "./keyline-definitions/chicken-box-lf.json";
import chickenBoxTop from "./keyline-definitions/chicken-box-top.json";
import f2 from "./keyline-definitions/f2.json";
import f2Bottom from "./keyline-definitions/f2bottom.json";
import fefco0200 from "./keyline-definitions/fefco0200.json";
import fefco0203 from "./keyline-definitions/fefco0203.json";
import fefco0204 from "./keyline-definitions/fefco0204.json";
import fefco0206 from "./keyline-definitions/fefco0206.json";
import fefco0207 from "./keyline-definitions/fefco0207.json";
import fefco0208 from "./keyline-definitions/fefco0208.json";
import fefco0209 from "./keyline-definitions/fefco0209.json";
import fefco0210 from "./keyline-definitions/fefco0210.json";
import fefco0211 from "./keyline-definitions/fefco0211.json";
import fefco0212 from "./keyline-definitions/fefco0212.json";
import fefco0214 from "./keyline-definitions/fefco0214.json";
import fefco0215 from "./keyline-definitions/fefco-0215.json";
import fefco0216 from "./keyline-definitions/fefco0216.json";
import fefco0217 from "./keyline-definitions/fefco0217.json";
import fefco0218 from "./keyline-definitions/fefco0218.json";
import fefco0219 from "./keyline-definitions/fefco0219.json";
import fefco0220 from "./keyline-definitions/fefco0220.json";
import fefco0221 from "./keyline-definitions/fefco0221.json";
import fefco0222 from "./keyline-definitions/fefco0222.json";
import fefco0225 from "./keyline-definitions/fefco0225.json";
import fefco0226 from "./keyline-definitions/fefco0226.json";
import fefco0227 from "./keyline-definitions/fefco0227.json";
import fefco0228 from "./keyline-definitions/fefco0228.json";
import fefco0229 from "./keyline-definitions/fefco0229.json";
import fefco0229One from "./keyline-definitions/fefco0229-1.json";
import fefco0230 from "./keyline-definitions/fefco0230.json";
import fefco0231 from "./keyline-definitions/fefco0231.json";
import fefco0232 from "./keyline-definitions/fefco0232.json";
import fefco0233 from "./keyline-definitions/fefco0233.json";
import fefco0233One from "./keyline-definitions/fefco0233-1.json";
import fefco0240 from "./keyline-definitions/fefco0240.json";
import fefco0241 from "./keyline-definitions/fefco0241.json";
import fefco0242 from "./keyline-definitions/fefco0242.json";
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
  fefco0200,
  fefco0203,
  fefco0204,
  fefco0206,
  fefco0207,
  fefco0208,
  fefco0209,
  fefco0210,
  fefco0211,
  fefco0212,
  fefco0214,
  fefco0215,
  fefco0216,
  fefco0217,
  fefco0218,
  fefco0219,
  fefco0220,
  fefco0221,
  fefco0222,
  fefco0225,
  fefco0226,
  fefco0227,
  fefco0228,
  fefco0229,
  fefco0229One,
  fefco0230,
  fefco0231,
  fefco0232,
  fefco0233,
  fefco0233One,
  fefco0240,
  fefco0241,
  fefco0242,
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
