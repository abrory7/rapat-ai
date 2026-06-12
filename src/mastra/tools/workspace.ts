import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { listFiles } from '@/lib/workspace/file-lister';
import { readFile } from '@/lib/workspace/file-reader';
import { searchCode } from '@/lib/workspace/code-searcher';
import { parseIgnoreRules } from '@/lib/workspace/ignore-filter';
import fs from 'fs';
import path from 'path';

// Helper to fetch project details from DB
async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found.`);
  }
  return project;
}

export const listFilesTool = createTool({
  id: 'list_files',
  description: 'List the contents of a directory in the project workspace, filtered by ignore rules.',
  inputSchema: z.object({
    projectId: z.string().describe('The ID of the current project'),
    relativePath: z.string().optional().describe('Relative directory path to list (e.g., "src/app")'),
  }),
  execute: async ({ projectId, relativePath }) => {
    try {
      const project = await getProject(projectId);
      const ignoreRules = parseIgnoreRules(project.ignoreRules);
      const entries = listFiles(project.repoPath, relativePath || '', ignoreRules);
      return { success: true, entries };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  },
});

export const readFileTool = createTool({
  id: 'read_file',
  description: 'Read the contents of a text file from the project workspace. Limited to 100KB.',
  inputSchema: z.object({
    projectId: z.string().describe('The ID of the current project'),
    filePath: z.string().describe('Relative path of the file to read (e.g., "src/app/page.tsx")'),
  }),
  execute: async ({ projectId, filePath }) => {
    try {
      const project = await getProject(projectId);
      const ignoreRules = parseIgnoreRules(project.ignoreRules);
      const content = readFile(project.repoPath, filePath, ignoreRules);
      return { success: true, content };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  },
});

export const searchCodeTool = createTool({
  id: 'search_code',
  description: 'Search for text patterns (substrings) inside project files recursively.',
  inputSchema: z.object({
    projectId: z.string().describe('The ID of the current project'),
    query: z.string().describe('The text query to search for'),
  }),
  execute: async ({ projectId, query }) => {
    try {
      const project = await getProject(projectId);
      const ignoreRules = parseIgnoreRules(project.ignoreRules);
      const matches = searchCode(project.repoPath, query, ignoreRules);
      return { success: true, matches };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  },
});

export const writeOutputTool = createTool({
  id: 'write_output',
  description: 'Write planning outputs, architecture diagrams, or generated specifications to the project output folder (.rapat-ai/outputs/).',
  inputSchema: z.object({
    projectId: z.string().describe('The ID of the current project'),
    fileName: z.string().describe('Name of the file to write (e.g., "design_doc.md")'),
    content: z.string().describe('Content to write inside the file'),
  }),
  execute: async ({ projectId, fileName, content }) => {
    try {
      const project = await getProject(projectId);
      const outputDir = path.join(project.repoPath, '.rapat-ai', 'outputs');
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Ensure file name has no directory traversal
      const safeFileName = path.basename(fileName);
      const targetFilePath = path.join(outputDir, safeFileName);
      
      fs.writeFileSync(targetFilePath, content, 'utf8');
      
      return {
        success: true,
        filePath: path.join('.rapat-ai', 'outputs', safeFileName).replace(/\\/g, '/'),
      };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  },
});
