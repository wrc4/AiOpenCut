import { writeFile, readTextFile } from '@tauri-apps/api/fs';
import { open, save } from '@tauri-apps/api/dialog';

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  files: { id: string; filename: string; path: string }[];
  timeline?: any;
};

export async function pickProjectFile(): Promise<string | null> {
  const path = await open({ multiple: false, filters: [{ name: 'OpenCut Project', extensions: ['json'] }] });
  if (!path) return null;
  return Array.isArray(path) ? path[0] : path;
}

export async function loadProject(path: string): Promise<Project> {
  const text = await readTextFile(path);
  return JSON.parse(text) as Project;
}

export async function saveProject(path: string, project: Project): Promise<void> {
  await writeFile({ path, contents: JSON.stringify(project, null, 2) });
}

export async function showSaveDialog(defaultName = 'project.json'): Promise<string | null> {
  const path = await save({ defaultPath: defaultName });
  return path ?? null;
}