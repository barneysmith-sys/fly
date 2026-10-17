import { createContext, useContext, useEffect } from "react";

export type ChromeState = {
  status: string;
  mode: string;
};

export const ChromeContext = createContext<(next: ChromeState) => void>(() => {});

/** Publish the simulation status shown in the top bar. */
export function useChrome(status: string, mode: string) {
  const publish = useContext(ChromeContext);
  useEffect(() => {
    publish({ status, mode });
  }, [publish, status, mode]);
}
