import { persistLanguage, useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
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
        className="h-9 gap-1 px-2 sm:w-[110px] sm:px-2.5"
        aria-label="Language"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
