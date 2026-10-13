import { formatPrice } from "@/lib/format";

/** A price of 0 means the package has no per-pax price (it is priced per package or by the items chosen): see its notes. */
export const hasPackagePrice = (price: number | null | undefined) => Number(price) > 0;

export function packagePriceLabel(price: number | null | undefined): string {
  return hasPackagePrice(price) ? formatPrice(Number(price)) : "See notes";
}
