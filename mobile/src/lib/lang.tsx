import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Lang } from "./i18n";
import { translate } from "./i18n";
import { useAuth } from "./auth";
import { updateProfile } from "./api";

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Parameters<typeof translate>[1]) => string;
}>({
  lang: "en",
  setLang: () => {},
  t: (k) => translate("en", k),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [lang, setLangState] = useState<Lang>("en");

  // Sync with the user's stored preference once profile loads.
  useEffect(() => {
    if (profile?.preferred_language === "am" || profile?.preferred_language === "en") {
      setLangState(profile.preferred_language);
    }
  }, [profile?.preferred_language]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      if (user) {
        void updateProfile(user.id, { preferred_language: l }).catch(() => {});
      }
    },
    [user],
  );

  const t = useCallback((k: Parameters<typeof translate>[1]) => translate(lang, k), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
