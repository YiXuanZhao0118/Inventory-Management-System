import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const productId = formData.get('productId') as string | null;
    const fileMetadataString = formData.get('fileMetadata') as string | null;
    const files = formData.getAll('files') as File[] | null;
    const serialOrPN = formData.get('serialOrPN') as string | null;

    if (!productId || !fileMetadataString || !files || files.length === 0) {
      return NextResponse.json({ message: 'Missing data' }, { status: 400 });
    }

    const fileMetadata = JSON.parse(fileMetadataString);

    // Get current date and time in YYYY-MM-DD_HH-MM-SS format
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const currentDate = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

    // Define base upload directory
    const uploadDir = path.join(
        process.cwd(),
        'public',
        'product_files',
        productId,
        serialOrPN || '_no_serial_or_pn',
        currentDate
    );

    // Create base directory if it doesn't exist
    await fs.mkdir(uploadDir, { recursive: true });

    const saveResults = await Promise.all(files.map(async (file) => {
        const metadata = fileMetadata.find((meta: any) => meta.name === file.name);

        if (!metadata) {
            console.warn(`Metadata not found for file: ${file.name}`);
            return { name: file.name, status: 'skipped', error: 'Metadata missing' };
        }

        const categoryDir = path.join(uploadDir, metadata.category);
        const originalFileName = file.name;
        const fileExtension = path.extname(originalFileName);
        // Ensure file name does not contain invalid characters for path if needed, but for simplicity, using original name for now
        const finalFileName = `${metadata.order}_${originalFileName}`;
        const finalPath = path.join(categoryDir, finalFileName);

        try {
            // Create category directory if it doesn't exist
            await fs.mkdir(categoryDir, { recursive: true });

            // Read file content
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // Write file to disk
            await fs.writeFile(finalPath, buffer);
            console.log(`Successfully saved ${finalFileName} to ${categoryDir}`);
            return { name: file.name, status: 'success', path: `/product_files/${productId}/${currentDate}/${metadata.category}/${finalFileName}` };
        } catch (error: any) {
            console.error(`Failed to save file ${file.name}:`, error);
            return { name: file.name, status: 'failed', error: error.message };
        }
    }));

    // Check if any uploads failed
    const failedUploads = saveResults.filter(result => result.status === 'failed');

    if (failedUploads.length > 0) {
        return NextResponse.json({
            message: 'Some files failed to upload',
            results: saveResults
        }, { status: 500 }); // Or 207 Multi-Status if you want
    }

    return NextResponse.json({ message: 'Files uploaded successfully', results: saveResults }, { status: 200 });

  } catch (error: any) {
    console.error('Upload API error:', error);
    return NextResponse.json({ message: 'Internal server error', error: error.message }, { status: 500 });
  }
} 