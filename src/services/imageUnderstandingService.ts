// [SCOPE] Image Understanding Service -- structured screenshot/image analysis pipeline.
// Goes beyond raw base64 forwarding: extracts UI elements, detects errors, provides context.
// Used by fix pipeline (screenshot of error), build pipeline (design mockup), and chat.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ImageAnalysis {
  description: string;
  detectedElements: string[];
  errors: string[];
  suggestions: string[];
  isScreenshot: boolean;
  isErrorScreen: boolean;
  isDesignMockup: boolean;
}

export interface ImageInput {
  base64: string;
  mimeType: string; // 'image/png', 'image/jpeg', etc.
  sourcePath?: string;
  context?: string; // user's description of what they want
}

/**
 * Analyze an image using the AI provider's vision capability.
 * Returns structured analysis instead of raw text.
 */
export async function analyzeImage(
  image: ImageInput,
  callAI: (prompt: string, imageBase64?: string, imageType?: string) => Promise<{ success: boolean; text: string }>
): Promise<ImageAnalysis> {
  const prompt = buildAnalysisPrompt(image.context);
  const result = await callAI(prompt, image.base64, image.mimeType);

  if (!result.success || !result.text) {
    return { description: 'Could not analyze image', detectedElements: [], errors: [], suggestions: [], isScreenshot: false, isErrorScreen: false, isDesignMockup: false };
  }

  return parseAnalysisResponse(result.text);
}

/**
 * Extract text content from a screenshot (OCR-like via vision AI).
 * Useful for reading error messages from terminal screenshots.
 */
export async function extractTextFromImage(
  image: ImageInput,
  callAI: (prompt: string, imageBase64?: string, imageType?: string) => Promise<{ success: boolean; text: string }>
): Promise<string> {
  const prompt = `Extract ALL visible text from this image. Return the text exactly as it appears, preserving line breaks and formatting. If it's a terminal/console, include the full error output. Do not add any commentary -- just the extracted text.`;
  const result = await callAI(prompt, image.base64, image.mimeType);
  return result.success ? result.text.trim() : '';
}

/**
 * Compare a design mockup image to actual rendered output.
 * Returns differences and suggestions for fixing.
 */
export async function compareToDesign(
  mockup: ImageInput,
  actual: ImageInput,
  callAI: (prompt: string, imageBase64?: string, imageType?: string) => Promise<{ success: boolean; text: string }>
): Promise<string> {
  // [WARN] Most AI vision APIs only accept one image per call.
  // Send mockup first, then actual with context about the mockup description.
  const mockupAnalysis = await callAI(
    'Describe this UI design mockup in detail: layout, colors, fonts, spacing, components, and hierarchy.',
    mockup.base64, mockup.mimeType
  );
  if (!mockupAnalysis.success) { return 'Could not analyze mockup image.'; }

  const comparisonPrompt = `This is the ACTUAL rendered output of a web page. Compare it to this design specification:\n\n${mockupAnalysis.text}\n\nList every visual difference between the design spec and this actual output. Be specific: exact pixel/spacing differences, wrong colors, missing elements, alignment issues.`;
  const comparison = await callAI(comparisonPrompt, actual.base64, actual.mimeType);
  return comparison.success ? comparison.text : 'Could not compare images.';
}

/**
 * Load an image from a file path and return as base64 input.
 */
export function loadImageFromPath(filePath: string): ImageInput | null {
  try {
    if (!fs.existsSync(filePath)) { return null; }
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    };
    const mimeType = mimeMap[ext];
    if (!mimeType) { return null; }
    const buffer = fs.readFileSync(filePath);
    return { base64: buffer.toString('base64'), mimeType, sourcePath: filePath };
  } catch { return null; }
}

/**
 * Get an image from the clipboard (if available).
 */
export async function getClipboardImage(): Promise<ImageInput | null> {
  try {
    const clipItems = await vscode.env.clipboard.readText();
    // VS Code clipboard API doesn't directly support images.
    // User must paste via webview's paste handler (which converts to base64).
    return null;
  } catch { return null; }
}

// --- Internal ---

function buildAnalysisPrompt(context?: string): string {
  let prompt = `Analyze this image and respond in this exact format:
DESCRIPTION: [one-sentence description of what the image shows]
TYPE: [screenshot|error|mockup|code|other]
ELEMENTS: [comma-separated list of UI elements or content visible]
ERRORS: [comma-separated list of any error messages, warnings, or issues visible -- or "none"]
SUGGESTIONS: [comma-separated list of actionable suggestions based on what you see -- or "none"]`;
  if (context) { prompt += `\n\nUser context: "${context}"`; }
  return prompt;
}

function parseAnalysisResponse(text: string): ImageAnalysis {
  const desc = text.match(/DESCRIPTION:\s*(.+)/i)?.[1]?.trim() || text.slice(0, 100);
  const type = text.match(/TYPE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || 'other';
  const elements = text.match(/ELEMENTS:\s*(.+)/i)?.[1]?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const errors = text.match(/ERRORS:\s*(.+)/i)?.[1]?.trim();
  const suggestions = text.match(/SUGGESTIONS:\s*(.+)/i)?.[1]?.trim();

  return {
    description: desc,
    detectedElements: elements,
    errors: errors && errors.toLowerCase() !== 'none' ? errors.split(',').map(s => s.trim()) : [],
    suggestions: suggestions && suggestions.toLowerCase() !== 'none' ? suggestions.split(',').map(s => s.trim()) : [],
    isScreenshot: type === 'screenshot' || type === 'error',
    isErrorScreen: type === 'error',
    isDesignMockup: type === 'mockup',
  };
}
