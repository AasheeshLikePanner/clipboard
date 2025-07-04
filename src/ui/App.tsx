import { useEffect, useState } from 'react'
import { Copy, Check, FileImage } from 'lucide-react'
import './App.css'

function App() {
    const [clipboardHistory, setClipboardHistory] = useState<any[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [imageErrors, setImageErrors] = useState<{[key: number]: string}>({});

    useEffect(() => {
        window.electron?.getClipboardHistory().then(history => {
            setClipboardHistory(history);
            console.log("=== CLIPBOARD HISTORY ===");
            history.forEach((item:any, index) => {
                console.log(`Item ${index}:`, {
                    format: item.format,
                    contentType: typeof item.content,
                    contentLength: item.content?.length,
                    isDataURL: item.content?.startsWith?.('data:'),
                    mimeType: item.content?.substring?.(0, 50)
                });
            });
        });

        const unsubscribe = window.electron?.onClipboardHistoryUpdate(history => {
            setClipboardHistory(history);
            console.log("=== UPDATED HISTORY ===");
            history.forEach((item:any, index) => {
                if (item.format !== 'text/plain') {
                    console.log(`Image ${index}:`, {
                        format: item.format,
                        contentType: typeof item.content,
                        contentLength: item.content?.length,
                        startsWithData: item.content?.startsWith?.('data:'),
                        preview: item.content?.substring?.(0, 100)
                    });
                }
            });
        });

        return () => {
            unsubscribe?.();
        };
    }, []);

    const handleCopyToClipboard = (content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1000);
    };

    const handleImageCopy = (item: any, index: number) => {
        if (navigator.clipboard && navigator.clipboard.write) {
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

    // Enhanced data URL validation
    const validateDataURL = (dataURL: string): boolean => {
        try {
            // Check basic format
            if (!dataURL.startsWith('data:')) {
                console.log('❌ Not a data URL');
                return false;
            }

            // Check if it has the comma separator
            if (!dataURL.includes(',')) {
                console.log('❌ No comma separator found');
                return false;
            }

            const parts = dataURL.split(',');
            if (parts.length !== 2) {
                console.log('❌ Invalid data URL structure');
                return false;
            }

            // Check if base64 part exists and is substantial
            const base64Part = parts[1];
            if (!base64Part || base64Part.length < 100) {
                console.log('❌ Base64 part too short:', base64Part?.length);
                return false;
            }

            // Try to decode base64 to validate
            try {
                atob(base64Part);
                console.log('✅ Valid base64 encoding');
                return true;
            } catch (e) {
                console.log('❌ Invalid base64 encoding:', e);
                return false;
            }
        } catch (error) {
            console.log('❌ Data URL validation error:', error);
            return false;
        }
    };

    const getImageSrc = (item: any) => {
        if (item.format === 'text/plain') {
            return null;
        }
        
        console.log('🔍 Processing image item:', {
            format: item.format,
            contentType: typeof item.content,
            hasContent: !!item.content,
            contentLength: item.content?.length,
            contentStart: item.content?.substring?.(0, 50)
        });
        
        if (typeof item.content === 'string') {
            if (item.content.startsWith('data:')) {
                console.log('🔍 Found data URL, validating...');
                
                // Enhanced validation
                if (validateDataURL(item.content)) {
                    console.log('✅ Valid data URL confirmed');
                    return item.content;
                } else {
                    console.log('❌ Invalid data URL detected');
                    setImageErrors(prev => ({
                        ...prev,
                        [item.index || Date.now()]: 'Invalid data URL format'
                    }));
                    return null;
                }
            } else if (item.content.startsWith('http')) {
                console.log('✅ Valid HTTP URL found');
                return item.content;
            } else {
                console.log('❌ String content but no valid URL format');
                console.log('Content preview:', item.content.substring(0, 100));
            }
        }
        
        if (item.content instanceof Uint8Array || item.content instanceof ArrayBuffer) {
            console.log('✅ Binary data found, converting to blob URL');
            try {
                const blob = new Blob([item.content], { type: item.format || 'image/png' });
                const blobUrl = URL.createObjectURL(blob);
                console.log('✅ Blob URL created:', blobUrl);
                return blobUrl;
            } catch (error) {
                console.log('❌ Failed to create blob URL:', error);
                return null;
            }
        }
        
        console.log('❌ No valid image source found');
        return null;
    };

    const handleImageError = (index: number, error: any) => {
        console.error(`❌ Image ${index} failed to load:`, error);
        const item = clipboardHistory[index];
        console.log('Failed item details:', {
            format: item?.format,
            contentType: typeof item?.content,
            contentLength: item?.content?.length,
            contentPreview: item?.content?.substring?.(0, 100)
        });
        
        setImageErrors(prev => ({
            ...prev,
            [index]: 'Failed to load image'
        }));
    };

    const handleImageLoad = (index: number) => {
        console.log(`✅ Image ${index} loaded successfully`);
        setImageErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[index];
            return newErrors;
        });
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
                            const imageSrc = item.format !== 'text/plain' ? getImageSrc(item) : null;
                            const hasImageError = imageErrors[index];
                            
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
                                            {imageSrc && !hasImageError ? (
                                                <img 
                                                    src={imageSrc}
                                                    alt='Clipboard'
                                                    className='max-w-full max-h-full object-contain rounded-lg'
                                                    onLoad={() => handleImageLoad(index)}
                                                    onError={(e) => handleImageError(index, e)}
                                                />
                                            ) : (
                                                <div className='text-center'>
                                                    <FileImage className='w-4 h-4 text-gray-500 mx-auto mb-1' />
                                                    <p className='text-gray-500 text-xs'>
                                                        {hasImageError ? 'Load Error' : 'Image'}
                                                    </p>
                                                    <p className='text-gray-600 text-xs'>{item.format}</p>
                                                    <p className='text-gray-600 text-xs mt-1'>
                                                        {typeof item.content === 'string' ? 
                                                            `${item.content.length} chars` : 
                                                            typeof item.content
                                                        }
                                                    </p>
                                                    {hasImageError && (
                                                        <p className='text-red-400 text-xs mt-1'>
                                                            {imageErrors[index]}
                                                        </p>
                                                    )}
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