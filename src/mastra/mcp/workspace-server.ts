import { MCPServer } from '@mastra/mcp';
import { listFilesTool, readFileTool, searchCodeTool, writeOutputTool } from '../tools/workspace';

export const workspaceMcpServer = new MCPServer({
  name: 'Rapat AI Workspace Server',
  version: '1.0.0',
  description: 'Built-in workspace server providing access to repository files and outputs.',
  tools: {
    list_files: listFilesTool,
    read_file: readFileTool,
    search_code: searchCodeTool,
    write_output: writeOutputTool,
  },
});

export default workspaceMcpServer;
