import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import type { Dimensions, ImageData, Mask } from "./models";
import {
  BACKEND_TOKEN,
  BACKEND_URL,
  colors,
  encodeFileToBase64,
  processingSteps,
} from "./utils";
import { Button, Card, CardBody, CardHeader, Checkbox, Chip, Divider, Modal, ModalBody, ModalContent, ModalHeader, Progress } from "@heroui/react";
import { Download, ImageIcon, Layers, Palette, Sparkles, Upload } from "lucide-react";

const BuildingPainter: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [baseImageLoaded, setBaseImageLoaded] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showAllMasks, setShowAllMasks] = useState<boolean>(false);
  const [selectedMasks, setSelectedMasks] = useState<Set<number>>(new Set());
  const [processingStep, setProcessingStep] = useState(0);
  const [appliedMasks, setAppliedMasks] = useState<
    Map<number, [number, number, number]>
  >(new Map());
  const [selectedColor, setSelectedColor] = useState<[number, number, number]>([
    255, 0, 0,
  ]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });

  const applyColor = async () => {
    if (selectedMasks.size === 0) return;

    setLoading(true);
    const sessionId = localStorage.getItem("sessionId");
    if (!sessionId || !originalImage) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post<{ colored_image: string }>(
        `${BACKEND_URL}/apply-colors`,
        {
          session_id: sessionId,
          mask_indices: Array.from(selectedMasks),
          color: selectedColor,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${BACKEND_TOKEN}`,
          },
        }
      );
      setImage(response.data.colored_image);
      const newAppliedMasks = new Map(appliedMasks);
      selectedMasks.forEach((maskIndex) => {
        newAppliedMasks.set(maskIndex, [...selectedColor]);
      });
      setAppliedMasks(newAppliedMasks);
      setSelectedMasks(new Set());
    } catch (error) {
      console.error("Error applying color:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || !canvasRef.current || loading) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    const scaledX = Math.floor(x * scaleX);
    const scaledY = Math.floor(y * scaleY);
    const sessionId = localStorage.getItem("sessionId");
    if (!sessionId) {
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post<{ mask_indices: number[] }>(
        `${BACKEND_URL}/get-mask-at-point`,
        {
          x: scaledX,
          y: scaledY,
          session_id: sessionId,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${BACKEND_TOKEN}`,
          },
        }
      );

      const newSelected = new Set(selectedMasks);
      const newAppliedMasks = new Map(appliedMasks);

      // Remove applied colors for any clicked masks that already have colors applied
      response.data.mask_indices.forEach((idx) => {
        if (appliedMasks.has(idx)) {
          newAppliedMasks.delete(idx);
        }
      });

      // Update applied masks state if any were removed
      if (newAppliedMasks.size !== appliedMasks.size) {
        setAppliedMasks(newAppliedMasks);
      }

      // Handle selection based on click type
      if (e.shiftKey && e.button === 0) {
        // Shift + Left click: Add to selection
        response.data.mask_indices.forEach((idx) => newSelected.add(idx));
      } else if (e.button === 2) {
        // Right click: Remove from selection
        response.data.mask_indices.forEach((idx) => newSelected.delete(idx));
      } else {
        // Regular left click: Replace selection
        newSelected.clear();
        response.data.mask_indices.forEach((idx) => newSelected.add(idx));
      }

      setSelectedMasks(newSelected);
      renderCanvas(newSelected);
    } catch (error) {
      console.error("Error getting mask:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset image loaded state
    setBaseImageLoaded(false);
    setSelectedMasks(new Set());
    setAppliedMasks(new Map());
    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      setOriginalImage(result);
      setImage(result);
      setImageLoading(true);
      setLoading(true);

      try {
        const fileBase64 = await encodeFileToBase64(file);
        const sessionId = String(Date.now());
        localStorage.setItem("sessionId", sessionId);
        const response = await axios.post<ImageData>(
          `${BACKEND_URL}/generate-masks`,
          {
            file: fileBase64,
            session_id: sessionId,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${BACKEND_TOKEN}`,
            },
          }
        );

        setMasks(response.data.masks);
        setDimensions({
          width: response.data.width,
          height: response.data.height,
        });
      } catch (error) {
        console.error("Error generating masks:", error);
      } finally {
        setLoading(false);
        setImageLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const renderCanvas = async (maskIndices: Set<number> = selectedMasks) => {
    if (!image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Show loading state
    setBaseImageLoaded(false);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = async () => {
      const ratio = Math.min(
        canvas.width / img.width,
        canvas.height / img.height
      );
      const newWidth = img.width * ratio;
      const newHeight = img.height * ratio;

      // Draw original image first
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Set image loaded BEFORE processing masks to prevent flicker
      setBaseImageLoaded(true);

      const masksToShow = new Set<number>();

      if (showAllMasks) {
        masks.forEach((_, idx) => masksToShow.add(idx));
      }

      // Add applied masks
      appliedMasks.forEach((_, maskIdx) => masksToShow.add(maskIdx));

      // Add currently selected masks
      maskIndices.forEach((idx) => masksToShow.add(idx));

      if (masksToShow.size > 0) {
        const overlay = document.createElement("canvas");
        overlay.width = dimensions.width;
        overlay.height = dimensions.height;
        const overlayCtx = overlay.getContext("2d");
        if (!overlayCtx) return;

        const imageData = overlayCtx.createImageData(
          dimensions.width,
          dimensions.height
        );
        const data = imageData.data;

        // Initialize with transparent pixels
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 0; // R
          data[i + 1] = 0; // G
          data[i + 2] = 0; // B
          data[i + 3] = 0; // A (transparent)
        }

        // Sort masks by area (largest first)
        const sortedMasks = [...masks]
          .map((mask, idx) => ({ mask, idx }))
          .filter(({ idx }) => masksToShow.has(idx))
          .sort((a, b) => b.mask.area - a.mask.area);

        let processedMasks = 0;
        const totalMasks = sortedMasks.length;

        for (const { mask, idx } of sortedMasks) {
          const maskImg = new Image();
          maskImg.onload = () => {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = dimensions.width;
            tempCanvas.height = dimensions.height;
            const tempCtx = tempCanvas.getContext("2d");
            if (!tempCtx) return;

            tempCtx.drawImage(maskImg, 0, 0);
            const maskImageData = tempCtx.getImageData(
              0,
              0,
              dimensions.width,
              dimensions.height
            );
            const maskData = maskImageData.data;

            let color: [number, number, number];

            if (appliedMasks.has(idx)) {
              // Use the applied color
              color = appliedMasks.get(idx)!;
            } else if (maskIndices.has(idx)) {
              // Use the currently selected color
              color = selectedColor;
            } else {
              // Use random color for showAllMasks
              color = [
                Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256),
              ];
            }

            // Apply mask color to pixels
            // Apply mask color to pixels
            for (let i = 0; i < maskData.length; i += 4) {
              if (maskData[i] > 128) {
                const pixelIndex = i;
                data[pixelIndex] = color[0]; // R
                data[pixelIndex + 1] = color[1]; // G
                data[pixelIndex + 2] = color[2]; // B

                // Different alpha values based on mask state
                let alpha = 128; // Default alpha

                if (appliedMasks.has(idx)) {
                  // Applied masks get higher opacity (darker/more prominent)
                  alpha = 180; // ~0.7 opacity
                } else if (maskIndices.has(idx)) {
                  // Currently selected masks get medium opacity
                  alpha = 128; // ~0.5 opacity
                } else {
                  // Show all masks get lower opacity (lighter)
                  alpha = 80; // ~0.3 opacity
                }

                data[pixelIndex + 3] = alpha; // A
              }
            }

            processedMasks++;

            if (processedMasks === totalMasks) {
              overlayCtx.putImageData(imageData, 0, 0);
              ctx.drawImage(
                overlay,
                0,
                0,
                dimensions.width,
                dimensions.height,
                0,
                0,
                newWidth,
                newHeight
              );
            }
          };
          maskImg.src = `data:image/png;base64,${mask.segmentation}`;
        }
      }
    };
    img.src = image;
  };

  const downloadImage = () => {
    if (!canvasRef.current) return;

    const dataURL = canvasRef.current.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = dataURL;
    link.download = "colored-building.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    renderCanvas();
  }, [image, showAllMasks, selectedColor, dimensions, appliedMasks]);
  useEffect(() => {
    if (imageLoading) {
      const interval = setInterval(() => {
        setProcessingStep((prev) => (prev + 1) % processingSteps.length);
      }, 1500);

      return () => clearInterval(interval);
    } else {
      setProcessingStep(0);
    }
  }, [imageLoading]);
  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4 md:p-6 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-pink-400/20 to-orange-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-indigo-400/10 to-cyan-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          {/* Header */}
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4 animate-gradient">
              Building Painter
            </h1>
            <p className="text-gray-600 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
              Transform your building images with AI-powered wall painting
              technology
            </p>
            <div className="flex justify-center mt-4">
              <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20">
                <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
                <span className="text-sm font-medium text-gray-700">
                  Powered by SAM2 AI
                </span>
              </div>
            </div>
          </div>

          {/* Upload Section */}
          <Card className="mb-6 shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
            <CardHeader className="pb-2 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Upload Building Image
                </h2>
              </div>
            </CardHeader>
            <CardBody>
              <div className="relative">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors duration-300 bg-gradient-to-br from-gray-50 to-blue-50/30">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={loading || imageLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="space-y-3">
                    <div className="mx-auto w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-gray-700">
                        Drop your building image here
                      </p>
                      <p className="text-sm text-gray-500">
                        or click to browse files
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {image && (
            <>
              {/* Canvas Section */}
              <Card className="mb-6 shadow-2xl border-0 overflow-hidden bg-white/90 backdrop-blur-sm hover:shadow-3xl transition-all duration-500">
                <CardBody className="p-0">
                  <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg overflow-hidden">
                    <canvas
                      width={dimensions.width}
                      height={dimensions.height}
                      ref={canvasRef}
                      onClick={handleCanvasClick}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleCanvasClick(e);
                      }}
                      style={{
                        transition: "all 0.3s ease-in-out",
                        opacity: baseImageLoaded ? 1 : 0.7,
                        filter: baseImageLoaded ? "none" : "blur(2px)",
                      }}
                      className={`w-full h-auto object-contain ${
                        loading ? "cursor-progress" : "cursor-crosshair"
                      } hover:scale-[1.01] transition-transform duration-300`}
                    />
                    {loading && (
                      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>

              {/* Controls Section */}
              <Card className="shadow-2xl border-0 bg-white/90 backdrop-blur-sm hover:shadow-3xl transition-all duration-300">
                <CardHeader className="pb-2 bg-gradient-to-r from-purple-50 to-pink-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
                      <Palette className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      Painting Controls
                    </h2>
                  </div>
                </CardHeader>
                <CardBody className="space-y-6">
                  {/* Status and Options */}
                  <div className="flex flex-wrap items-center gap-4">
                    <Checkbox
                      isSelected={showAllMasks}
                      onValueChange={setShowAllMasks}
                      color="primary"
                      size="sm"
                      className="hover:scale-105 transition-transform"
                    >
                      <span className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        Show All Masks
                      </span>
                    </Checkbox>

                    <div className="flex gap-3">
                      <Chip
                        color="primary"
                        variant="flat"
                        size="sm"
                        startContent={<ImageIcon className="w-3 h-3" />}
                        className="hover:scale-105 transition-transform"
                      >
                        Selected: {selectedMasks.size}
                      </Chip>
                      <Chip
                        color="success"
                        variant="flat"
                        size="sm"
                        startContent={<Palette className="w-3 h-3" />}
                        className="hover:scale-105 transition-transform"
                      >
                        Applied: {appliedMasks.size}
                      </Chip>
                    </div>
                  </div>

                  <Divider className="bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

                  {/* Color Palette */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Color Palette
                    </h3>
                    <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                      {colors.map((color, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedColor(color)}
                          className={`h-14 w-14 rounded-2xl border-3 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:rotate-3 ${
                            selectedColor[0] === color[0] &&
                            selectedColor[1] === color[1] &&
                            selectedColor[2] === color[2]
                              ? "border-blue-500 shadow-xl scale-110 rotate-3"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          style={{
                            backgroundColor: `rgb(${color.join(",")})`,
                            boxShadow: `0 4px 20px rgba(${color.join(
                              ","
                            )}, 0.3)`,
                          }}
                          aria-label={`Select color ${i + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  <Divider className="bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-4">
                    <Button
                      onClick={applyColor}
                      isDisabled={selectedMasks.size === 0 || loading}
                      color="success"
                      size="lg"
                      startContent={<Palette className="w-4 h-4" />}
                      className="font-semibold hover:scale-105 transition-transform bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg hover:shadow-xl"
                    >
                      Apply Color
                    </Button>

                    <Button
                      onClick={downloadImage}
                      isDisabled={!image || loading}
                      color="primary"
                      size="lg"
                      startContent={<Download className="w-4 h-4" />}
                      className="font-semibold hover:scale-105 transition-transform bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg hover:shadow-xl"
                    >
                      Download Image
                    </Button>
                  </div>

                  {/* Instructions */}
                  <Card className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 border-0 shadow-inner">
                    <CardBody className="py-4">
                      <div className="text-sm text-gray-600 space-y-2">
                        <p className="font-semibold text-gray-700 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          How to use:
                        </p>
                        <div className="grid md:grid-cols-2 gap-2 text-xs">
                          <p>• Click on walls to select segments</p>
                          <p>• Shift + Click to combine segments</p>
                          <p>• Choose colors from the palette</p>
                          <p>• Download your painted masterpiece!</p>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Processing Modal */}
      <Modal
        isOpen={imageLoading}
        onClose={() => {}}
        hideCloseButton
        isDismissable={false}
        backdrop="blur"
        size="md"
        className="bg-transparent"
      >
        <ModalContent className="bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
          <ModalHeader className="flex flex-col gap-1 text-center pb-2">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AI Processing
            </h3>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="text-center space-y-6">
              {/* Animated Icon */}
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-ping opacity-20"></div>
                <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 rounded-full w-20 h-20 flex items-center justify-center animate-pulse">
                  {React.createElement(processingSteps[processingStep].icon, {
                    className: "w-8 h-8 text-white animate-bounce",
                  })}
                </div>
              </div>

              {/* Processing Text */}
              <div className="space-y-3">
                <p
                  className={`text-lg font-semibold transition-all duration-500 ${processingSteps[processingStep].color}`}
                >
                  {processingSteps[processingStep].text}
                </p>
                <Progress
                  size="sm"
                  isIndeterminate
                  color="primary"
                  className="max-w-xs mx-auto"
                  classNames={{
                    indicator: "bg-gradient-to-r from-blue-500 to-purple-500",
                  }}
                />
              </div>

              {/* Fun Facts */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Did you know?</p>
                <p>
                  SAM2 can identify over 1000 different object types in images
                  with 95% accuracy!
                </p>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default BuildingPainter;
