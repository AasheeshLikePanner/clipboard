type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
}

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
}

type UnsubscribeFunction = () => void;

type ClipboardItem = {
    format: string;
    content: string;
    timestamp: number;
};

type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    getClipboardHistory: ClipboardItem[];
    "clipboard-history-update": ClipboardItem[];
}

interface Window {
    electron: {
        subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
        getStaticData: () => Promise<StaticData>;
        getClipboardHistory: () => Promise<ClipboardItem[]>;
        onClipboardHistoryUpdate: (callback: (history: ClipboardItem[]) => void) => UnsubscribeFunction;
    }
}