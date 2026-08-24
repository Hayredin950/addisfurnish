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
      {/* Full label from `sm`; below that only the globe fits a 360px header
          alongside logo, bell, avatar and burger without horizontal scroll. */}
      <SelectTrigger
        className="h-9 w-9 justify-center gap-0 px-0 sm:w-[128px] sm:justify-start sm:gap-1.5 sm:px-2.5"
        aria-label="Language"
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline-flex">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
