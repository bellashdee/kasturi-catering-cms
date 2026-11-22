"use client";

import { createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";

type Value = { o2Id: string | null; accessibleIds: string[]; allowedModules: string[] | null };

const RestaurantViewContext = createContext<Value>({ o2Id: null, accessibleIds: [], allowedModules: null });

/** Tells the menus which company is O2 Life (the restaurant) and which companies the signed-in member may see. */
export function RestaurantViewProvider({ o2Id, accessibleIds, allowedModules, children }: Value & { children: React.ReactNode }) {
  return <RestaurantViewContext.Provider value={{ o2Id, accessibleIds, allowedModules }}>{children}</RestaurantViewContext.Provider>;
}

/**
 * True while O2 Life (Restoran Bara Ikan Bakar Senibong) is the only company being viewed: the menus then hide what is made for catering
 * events. Same rule as the server (`isRestaurantOnly`): the company in the address if the member may see it, else every company they may see.
 */
export function useRestaurantView(): boolean {
  const { o2Id, accessibleIds } = useContext(RestaurantViewContext);
  const requested = useSearchParams().get("company");
  if (!o2Id) return false;
  const target = requested && accessibleIds.includes(requested) ? [requested] : accessibleIds;
  return target.length === 1 && target[0] === o2Id;
}

/** Whether the member may open this module (null = every module). */
export function useCanOpenModule(key: string): boolean {
  const { allowedModules } = useContext(RestaurantViewContext);
  return !allowedModules || allowedModules.includes(key);
}
