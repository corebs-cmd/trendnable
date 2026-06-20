import Sheet from './Sheet';
import FeatureGuide from './FeatureGuide';
import type { Theme } from '@/lib/theme';

export default function GuideSheet({
  open,
  onClose,
  theme,
  isDark,
}: {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  isDark: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="Feature Guide">
      <FeatureGuide theme={theme} isDark={isDark} />
    </Sheet>
  );
}
