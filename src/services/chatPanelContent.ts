// [SCOPE] CHASSIS Chat Panel Content Helper — provides utility to show command results in chat panel
// Allows commands to display their output in the main chat window instead of separate webviews.

import * as vscode from 'vscode';
import { ChatPanel } from '../ui/panels/chat/chatPanel';

export interface ContentPanelOptions {
  title: string;
  content: string;
  type?: 'html' | 'markdown' | 'text';
}

/**
 * Shows content in the chat panel's dynamic content area
 * This allows commands to display results inline in the chat window
 */
export function showInChatPanel(options: ContentPanelOptions): void {
  // Ensure chat panel is open
  if (!ChatPanel.currentPanel) {
    vscode.window.showInformationMessage('Please open CHASSIS Chat first');
    return;
  }

  // Format content based on type
  let formattedContent = options.content;
  if (options.type === 'markdown') {
    // Convert simple markdown to HTML
    formattedContent = markdownToHtml(options.content);
  } else if (options.type === 'text') {
    // Escape HTML and preserve formatting
    formattedContent = escapeHtml(options.content).replace(/\n/g, '<br>');
  }

  ChatPanel.currentPanel.showPanel('content', options.title, formattedContent);
}

/**
 * Simple markdown to HTML converter for chat panel display
 */
function markdownToHtml(markdown: string): string {
  return markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code style="background:var(--vscode-textCodeBlock-background);padding:2px 4px;border-radius:3px;">$1</code>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre style="background:var(--vscode-textCodeBlock-background);padding:12px;border-radius:6px;overflow-x:auto;"><code>$2</code></pre>')
    // Lists
    .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul style="margin:8px 0;padding-left:20px;">$&</ul>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}
