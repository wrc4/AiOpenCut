// Test script for library backend scanning
import fetch from 'node-fetch';

async function testLibraryScan() {
  const rootPath = process.argv[2] || process.env.TEST_LIBRARY_PATH || '/Users/wrc4/dev/AiOpenCut';

  console.log(`Testing library scan with path: ${rootPath}`);

  try {
    const response = await fetch('http://localhost:3000/api/library/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rootPath }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Error (${response.status}):`, error);
      process.exit(1);
    }

    const result = await response.json();
    console.log(`Success! Found ${result.folders.length} folders and ${result.items.length} items`);
    console.log('Folder:', result.folders);
    console.log('Files:', result.items);
    console.log(`Scan completed in ${result.scanTime}ms`);
  } catch (error) {
    console.error('Failed to test:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testLibraryScan();
}