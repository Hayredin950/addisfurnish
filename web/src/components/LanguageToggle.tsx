import { persistLanguage, useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Compact English/አማርኛ language switcher for the header. */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const { user } = useAuth();

  return (
    <Select
      value={lang}
      onValueChange={(v) => {
        setLang(v as "en" | "am");
        persistLanguage(user?.id, v as "en" | "am");
      }}
    >
      {/* w-[108px] clipped "አማርኛ" — Ethiopic glyphs are wider than their Latin
          counterparts at the same font size, and the trigger also has to fit
          the globe icon plus the chevron. Sized to content with a floor
          instead, and the icon is kept from shrinking. */}
      <SelectTrigger className="h-9 w-[128px] gap-1.5 px-2.5" aria-label="Language">
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
