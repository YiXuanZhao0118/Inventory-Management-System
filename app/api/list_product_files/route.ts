import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    let dirPath = searchParams.get('path') || '/';

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    // Normalize dirPath
    if (!dirPath.startsWith('/')) dirPath = '/' + dirPath;
    if (!dirPath.endsWith('/')) dirPath += '/';

    // Construct the directory path relative to the project root
    const filesDir = path.join(process.cwd(), 'public', 'product_files', productId, dirPath);

    // Check if the directory exists
    try {
      await fs.access(filesDir);
    } catch (error) {
      // If directory does not exist, return empty array (no files)
      return NextResponse.json({ files: [] });
    }

    // Read the contents of the directory
    const names = await fs.readdir(filesDir);

    // Get type and path for each entry
    const fileList = await Promise.all(
      names.map(async (name) => {
        const fullPath = path.join(filesDir, name);
        const stat = await fs.stat(fullPath);
        return {
          name,
          type: stat.isDirectory() ? 'folder' : 'file',
          path: path.posix.join(dirPath, name) + (stat.isDirectory() ? '/' : ''),
        };
      })
    );

    return NextResponse.json({ files: fileList });

  } catch (error: any) {
    console.error('Error listing product files:', error);
    return NextResponse.json({ error: 'Failed to list files', details: error.message }, { status: 500 });
  }
}