import React, { createContext, useContext, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import {
  IsolatedBottomSheetModal,
  type ContextBridge,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import { SheetHeaderView, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { ICON_SIZE } from "@/styles/theme";
import type { ToolCallIconComponent } from "@/utils/tool-call-icon";
import { ToolCallDetailsContent } from "./tool-call-details";

// ----- Types -----

export interface ToolCallSheetData {
  toolName: string;
  displayName: string;
  summary?: string;
  detail?: ToolCallDetail;
  errorText?: string;
  icon: ToolCallIconComponent;
  showLoadingSkeleton?: boolean;
}

interface ToolCallSheetContextValue {
  openToolCall: (token: object, data: ToolCallSheetData) => void;
  closeToolCall: () => void;
  syncToolCallData: (token: object, data: ToolCallSheetData) => void;
}

// ----- Context -----

const ToolCallSheetContext = createContext<ToolCallSheetContextValue | null>(null);

export function useToolCallSheet(): ToolCallSheetContextValue {
  const context = useContext(ToolCallSheetContext);
  if (!context) {
    throw new Error("useToolCallSheet must be used within a ToolCallSheetProvider");
  }
  return context;
}

export function useToolCallSheetContextBridge(): ContextBridge {
  const context = useToolCallSheet();
  return useCallback(
    (children) => (
      <ToolCallSheetContext.Provider value={context}>{children}</ToolCallSheetContext.Provider>
    ),
    [context],
  );
}

interface ToolCallHeaderIconProps {
  icon: ToolCallIconComponent;
  size: number;
  color?: string;
}

function ToolCallHeaderIcon({ icon: Icon, size, color }: ToolCallHeaderIconProps) {
  return <Icon size={size} color={color} />;
}

const ThemedToolCallHeaderIcon = withUnistyles(ToolCallHeaderIcon, (theme) => ({
  color: theme.colors.foreground,
}));

export const ToolCallSheetModal = withUnistyles(IsolatedBottomSheetModal, (theme) => ({
  backgroundStyle: {
    backgroundColor: theme.colors.surface2,
    borderRadius: 16,
  },
  handleIndicatorStyle: {
    backgroundColor: theme.colors.palette.zinc[600],
  },
}));

// ----- Provider Component -----

interface ToolCallSheetProviderProps {
  children: ReactNode;
}

// The sheet renders live tool call data through a token-scoped sync: the caller
// opens with an opaque token and re-syncs on every stream update, so the sheet
// follows streaming output instead of freezing at the moment it was opened.
interface ToolCallSheetSession {
  token: object;
  data: ToolCallSheetData;
}

export function ToolCallSheetProvider({ children }: ToolCallSheetProviderProps) {
  const [session, setSession] = React.useState<ToolCallSheetSession | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);

  const snapPoints = useMemo(() => ["60%", "95%"], []);

  const openToolCall = useCallback((token: object, data: ToolCallSheetData) => {
    setSession({ token, data });
    setIsSheetOpen(true);
  }, []);

  const closeToolCall = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  const syncToolCallData = useCallback((token: object, data: ToolCallSheetData) => {
    setSession((current) =>
      current !== null && current.token === token ? { ...current, data } : current,
    );
  }, []);

  const {
    sheetRef: bottomSheetRef,
    handleSheetChange,
    handleSheetDismiss,
  } = useIsolatedBottomSheetVisibility({
    visible: isSheetOpen,
    onClose: closeToolCall,
  });

  const handleToolCallSheetDismiss = useCallback(() => {
    handleSheetDismiss();
    setSession(null);
  }, [handleSheetDismiss]);

  const contextValue = useMemo(
    () => ({ openToolCall, closeToolCall, syncToolCallData }),
    [openToolCall, closeToolCall, syncToolCallData],
  );

  return (
    <ToolCallSheetContext.Provider value={contextValue}>
      {children}
      <ToolCallSheetModal
        ref={bottomSheetRef}
        contextBridge={null}
        snapPoints={snapPoints}
        index={0}
        enableDynamicSizing={false}
        onChange={handleSheetChange}
        onDismiss={handleToolCallSheetDismiss}
        backdropOpacity={0.5}
        enablePanDownToClose
      >
        {session && <ToolCallSheetContent data={session.data} onClose={closeToolCall} />}
      </ToolCallSheetModal>
    </ToolCallSheetContext.Provider>
  );
}

// ----- Sheet Content Component -----

interface ToolCallSheetContentProps {
  data: ToolCallSheetData;
  onClose: () => void;
}

function ToolCallSheetContent({ data, onClose }: ToolCallSheetContentProps) {
  const {
    toolName,
    displayName,
    detail,
    errorText,
    icon: IconComponent,
    showLoadingSkeleton,
  } = data;
  const header = useMemo<SheetHeader>(
    () => ({
      title: displayName,
      leading: <ThemedToolCallHeaderIcon icon={IconComponent} size={ICON_SIZE.md} />,
    }),
    [IconComponent, displayName],
  );

  return (
    <View style={styles.container}>
      <SheetHeaderView header={header} onClose={onClose} closeTestID="tool-call-sheet-close" />

      {/* Content */}
      <BottomSheetScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <ToolCallDetailsContent
          toolName={toolName}
          detail={detail}
          errorText={errorText}
          fillAvailableHeight
          showLoadingSkeleton={showLoadingSkeleton}
        />
      </BottomSheetScrollView>
    </View>
  );
}

// ----- Styles -----

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface2,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface2,
  },
  contentContainer: {
    padding: 0,
    flexGrow: 1,
  },
}));
