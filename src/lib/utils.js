import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { openUrl } from "@tauri-apps/plugin-opener";


export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export async function openWebsite() {
  await openUrl("https://ghostcompiler.dev");
}