import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import './App.css'

function App() {
    const [clipboardHistory, setClipboardHistory] = useState<any[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    useEffect(() => {
        window.electron?.getClipboardHistory().then(history => {
            setClipboardHistory(history);
            console.log("Initial clipboard history:", history);
            
            // Debug: Print image content details
            history.forEach((item:any, index) => {
                if (item.format !== 'text/plain') {
                    console.log(`Image ${index}:`, {
                        format: item.format,
                        contentType: typeof item.content,
                        contentLength: item.content?.length,
                        contentPreview: item.content?.substring(0, 100),
                        isBase64: item.content?.startsWith('data:'),
                        isBuffer: item.content instanceof ArrayBuffer,
                        isUint8Array: item.content instanceof Uint8Array
                    });
                }
            });
        });

        const unsubscribe = window.electron?.onClipboardHistoryUpdate(history => {
            setClipboardHistory(history);
            console.log("Updated clipboard history:", history);
            
            // Debug: Print image content details for updates
            history.forEach((item:any, index) => {
                if (item.format !== 'text/plain') {
                    console.log(`Updated Image ${index}:`, {
                        format: item.format,
                        contentType: typeof item.content,
                        contentLength: item.content?.length,
                        contentPreview: item.content?.substring(0, 100)
                    });
                }
            });
        });

        return () => {
            unsubscribe?.(); // Clean up the subscription on unmount
        };
    }, []);

    const handleCopyToClipboard = (content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedIndex(index);
        
        // Reset the copied state after 1 second
        setTimeout(() => {
            setCopiedIndex(null);
        }, 1000);
    };

    const handleImageCopy = (item: any, index: number) => {
        // Try to copy image to clipboard if supported
        if (navigator.clipboard && navigator.clipboard.write) {
            // For base64 images
            if (typeof item.content === 'string' && item.content.startsWith('data:')) {
                const blob = dataURLToBlob(item.content);
                navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]).then(() => {
                    setCopiedIndex(index);
                    setTimeout(() => setCopiedIndex(null), 1000);
                }).catch(err => {
                    console.error('Failed to copy image:', err);
                });
            }
        }
    };

    const dataURLToBlob = (dataURL: string) => {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    };

    const getImageSrc = (item: any) => {
        if (typeof item.content === 'string') {
            if (item.content.startsWith('data:')) {
                return item.content;
            } else if (item.content.startsWith('http')) {
                return item.content;
            }
        }
        // If it's a buffer or other format, we might need to convert it
        return null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            const container = e.currentTarget;
            container.scrollLeft += e.deltaY;
        }
    };
        
    const truncateText = (text: string, maxLength: number = 80) => {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
        <div className='h-[200px] bg-[#131313] text-white overflow-hidden'>
            <div className='h-full flex items-center justify-center px-4'>
                {clipboardHistory.length === 0 ? (
                    <div className='flex flex-col items-center justify-center opacity-30'>
                        <Copy className='w-6 h-6 text-gray-600 mb-1' />
                        <p className='text-gray-600 text-xs'>No clipboard history</p>
                    </div>
                ) : (
                    <div 
                        className='flex space-x-2 h-full items-center overflow-x-auto scrollbar-hide py-4'
                        onWheel={handleWheel}
                    >
                        {clipboardHistory.map((item, index) => {
                            const imageSrc = getImageSrc(item);
                            return (
                                <div 
                                    key={index}
                                    className='flex-none w-40 h-28 bg-[#1a1a1a] rounded-xl flex items-center justify-center p-3 transition-all duration-200 hover:bg-[#202020] cursor-pointer group relative overflow-hidden'
                                    onClick={() => {
                                        if (item.format === 'text/plain') {
                                            handleCopyToClipboard(item.content, index);
                                        } else {
                                            handleImageCopy(item, index);
                                        }
                                    }}
                                >
                                    {/* Copy success indicator */}
                                    {copiedIndex === index && (
                                        <div className='absolute top-2 right-2 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center'>
                                            <Check className='w-2.5 h-2.5 text-white' />
                                        </div>
                                    )}
                                    
                                    {/* Content */}
                                    {item.format === 'text/plain' ? (
                                        <p className='text-gray-300 text-xs leading-relaxed text-center line-clamp-4 break-words'>
                                            {truncateText(item.content, 80)}
                                        </p>
                                    ) : (
                                        <div className='w-full h-full flex items-center justify-center'>
                                            {imageSrc ? (
                                                <img 
                                                    src={imageSrc}
                                                    alt='Clipboard'
                                                    className='max-w-full max-h-full object-contain rounded-lg'
                                                    onError={(e) => {
                                                        console.error('Image failed to load:', item);
                                                        e.currentTarget.style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className='text-center'>
                                                    <Copy className='w-4 h-4 text-gray-500 mx-auto mb-1' />
                                                    <p className='text-gray-500 text-xs'>Image</p>
                                                    <p className='text-gray-600 text-xs'>{item.format}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            
            {/* Custom scrollbar styles */}
            <style>{`
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .line-clamp-4 {
                    display: -webkit-box;
                    -webkit-line-clamp: 4;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
            `}</style>
        </div>
    )
}

export default App