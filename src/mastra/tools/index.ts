import { listFilesTool, readFileTool, searchCodeTool, writeOutputTool } from './workspace';

export const workspaceTools = {
  listFilesTool,
  readFileTool,
  searchCodeTool,
  writeOutputTool,
};

export const allTools = {
  ...workspaceTools,
};

export default allTools;
