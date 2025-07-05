import React, { useEffect, useState } from 'react'
import { Copy, Check, FileImage } from 'lucide-react'
import './App.css'

function App() {
    const [clipboardHistory, setClipboardHistory] = useState<any[]>([]);
    const [copiedContent, setCopiedContent] = useState<string | null>(null);
    const [imageErrors, setImageErrors] = useState<{[key: number]: string}>({});

    useEffect(() => {
        // Mock data for development in browser
        if (!window.electron) {
            setClipboardHistory([
                { format: 'text/plain', content: 'Hello from NotchClip! This is a test item.' },
                { format: 'image/png', content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' }, // 1x1 red pixel
                { format: 'text/plain', content: 'Press Ctrl+Shift+V to open and Ctrl+W to close.' },
                { format: 'image/png', content: 'invalid-data-url' },
            ]);
        }

        window.electron?.getClipboardHistory().then(history => {
            setClipboardHistory(history);
        });

        const unsubscribe = window.electron?.onClipboardHistoryUpdate(history => {
            setClipboardHistory(history);
        });

        return () => {
            unsubscribe?.();
        };
    }, []);

    const handleCopyToClipboard = (content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedContent(content);
        setTimeout(() => setCopiedContent(null), 1200);
    };

    const handleImageCopy = (item: any, index: number) => {
        if (navigator.clipboard && navigator.clipboard.write) {
            if (typeof item.content === 'string' && item.content.startsWith('data:')) {
                const blob = dataURLToBlob(item.content);
                navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]).then(() => {
                    setCopiedContent(item.content);
                    setTimeout(() => setCopiedContent(null), 1200);
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

    const validateDataURL = (dataURL: string): boolean => {
        try {
            if (!dataURL.startsWith('data:') || !dataURL.includes(',')) return false;
            const parts = dataURL.split(',');
            if (parts.length !== 2 || !parts[1]) return false;
            atob(parts[1]); // Try decoding
            return true;
        } catch (e) {
            return false;
        }
    };

    const getImageSrc = (item: any, index: number) => {
        if (item.format === 'text/plain') return null;

        if (typeof item.content === 'string') {
            if (validateDataURL(item.content)) {
                return item.content;
            }
            if (item.content.startsWith('http')) {
                return item.content;
            }
        }

        if (item.content instanceof Uint8Array || item.content instanceof ArrayBuffer) {
            try {
                const blob = new Blob([item.content], { type: item.format || 'image/png' });
                return URL.createObjectURL(blob);
            } catch (error) {
                console.error('Failed to create blob URL:', error);
                setImageErrors(prev => ({ ...prev, [index]: 'Blob Error' }));
                return null;
            }
        }

        setImageErrors(prev => ({ ...prev, [index]: 'Invalid Format' }));
        return null;
    };

    const handleImageError = (index: number) => {
        setImageErrors(prev => ({ ...prev, [index]: 'Load Error' }));
    };

    const handleImageLoad = (index: number) => {
        setImageErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[index];
            return newErrors;
        });
    };

    const scrollAnimationRef = React.useRef<number | null>(null);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.deltaY === 0) return;

        e.preventDefault();

        const scrollContainer = e.currentTarget;
        const startScrollLeft = scrollContainer.scrollLeft;
        const targetScrollLeft = startScrollLeft + e.deltaY;
        const duration = 600; // milliseconds, increased for slower scroll
        let startTime: number | null = null;

        if (scrollAnimationRef.current) {
            cancelAnimationFrame(scrollAnimationRef.current);
        }

        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3); // Ease-out cubic function

        const animateScroll = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const elapsedTime = currentTime - startTime;
            let progress = Math.min(elapsedTime / duration, 1);
            progress = easeOutCubic(progress); // Apply easing function

            scrollContainer.scrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * progress;

            if (elapsedTime < duration) {
                scrollAnimationRef.current = requestAnimationFrame(animateScroll);
            } else {
                scrollAnimationRef.current = null;
            }
        };

        scrollAnimationRef.current = requestAnimationFrame(animateScroll);
    };

    const truncateText = (text: string, maxLength: number = 80) => {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
        <div className='h-[150px] ps-3  bg-[#131313] text-white overflow-hidden flex flex-col font-sans rounded-b-[40px]'>
            <main className='flex-grow h-full flex items-center justify-center px-4'>
                {clipboardHistory.length === 0 ? (
                    <div className='flex flex-col items-center justify-center opacity-40 fade-in'>
                        <img src="icon.png" draggable={false} alt="NotchClip Logo" className="user-drag-none select-none w-10 h-10 mb-2" />
                         <p className='text-gray-400 text-sm font-semibold'>NotchClip</p>
                        <p className='text-gray-500 text-xs mt-1'>Your clipboard history is empty.</p>
                    </div>
                ) : (
                    <div
                        className='flex space-x-3 h-full items-center overflow-x-auto overflow-y-hidden scrollbar-hide py-5'
                        onWheel={handleWheel}
                    >
                        {clipboardHistory.map((item, index) => {
                            const imageSrc = getImageSrc(item, index);
                            const hasImageError = !!imageErrors[index];

                            return (
                                <div
                                    key={index}
                                    className='clipboard-item group flex-none w-44 h-32 bg-[#1e1e1e] rounded-xl flex items-center justify-center p-3 transition-all duration-300 ease-in-out hover:bg-[#252525] hover:scale-105 cursor-pointer relative overflow-hidden'
                                    onClick={() => {
                                        if (item.format === 'text/plain') {
                                            handleCopyToClipboard(item.content, index);
                                        } else if (imageSrc && !hasImageError) {
                                            handleImageCopy(item, index);
                                        }
                                    }}
                                >
                                    {/* Copy icon in top-right on hover */}
                                    <button
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-80 bg-[#232323] rounded-full p-1 transition-opacity z-20"
                                        style={{ pointerEvents: 'auto' }}
                                        tabIndex={-1}
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (item.format === 'text/plain') {
                                                handleCopyToClipboard(item.content, index);
                                            } else if (imageSrc && !hasImageError) {
                                                handleImageCopy(item, index);
                                            }
                                        }}
                                        aria-label="Copy"
                                    >
                                        <Copy className="w-3 h-3 text-gray-400 hover:text-white" strokeWidth={2} />
                                    </button>
                                    {/* Copy success indicator */}
                                    {copiedContent === item.content && (
                                        <div className='absolute inset-0 bg-green-500/80 flex items-center justify-center z-10 fade-in-fast'>
                                            <Check className='w-8 h-8 text-white' />
                                        </div>
                                    )}
                                    {/* Content */}
                                    {item.format === 'text/plain' ? (
                                        <p className='text-gray-300 text-xs leading-relaxed text-center line-clamp-5 break-words'>
                                            {truncateText(item.content, 90)}
                                        </p>
                                    ) : (
                                        <div className='w-full h-full flex items-center justify-center'>
                                            {imageSrc && !hasImageError ? (
                                                <img
                                                    src={imageSrc}
                                                    alt='Clipboard content'
                                                    className='max-w-full max-h-full object-contain rounded-lg'
                                                    onLoad={() => handleImageLoad(index)}
                                                    onError={() => handleImageError(index)}
                                                />
                                            ) : (
                                                <div className='text-center text-gray-500'>
                                                    <FileImage className='w-5 h-5 mx-auto mb-1' />
                                                    <p className='text-xs font-medium'>Image</p>
                                                    <p className='text-red-500 text-xs mt-1 bg-red-900/50 px-1 rounded'>
                                                        {imageErrors[index] || 'Invalid'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
            
            {/* Footer with Hints */}
            <footer className="flex-shrink-0 w-full text-center py-1.5 px-4 bg-[#181818]/60">
                <p className="text-gray-500 text-[11px] flex items-center justify-center gap-4">
                    <span className="flex items-center gap-1.5">Open: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd></span>
                    <span className="flex items-center gap-1.5">Close: <kbd>Ctrl</kbd>+<kbd>W</kbd></span>
                </p>
            </footer>

            {/* Custom styles */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .fade-in { animation: fadeIn 0.5s ease-out forwards; }

                @keyframes fadeInFast {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .fade-in-fast { animation: fadeInFast 0.2s ease-out forwards; }

                .clipboard-item {
                    animation: fadeIn 0.4s ease-out forwards;
                    opacity: 0;
                    animation-delay: calc(var(--animation-order, 0) * 50ms);
                }

                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .line-clamp-5 {
                    display: -webkit-box;
                    -webkit-line-clamp: 5;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                kbd {
                    background-color: #333;
                    border-radius: 3px;
                    border: 1px solid #444;
                    padding: 1px 4px;
                    font-size: 10px;
                    font-family: monospace;
                }
            `}</style>
        </div>
    )
}

export default App