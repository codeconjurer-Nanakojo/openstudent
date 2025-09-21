// ImageKit client initialization and secure image upload utility

// Validate environment variables
const imagekitUrl = import.meta.env.VITE_IMAGEKIT_URL;
const imagekitPublicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;

if (!imagekitUrl || !imagekitPublicKey) {
  console.error('❌ Missing ImageKit environment variables');
  throw new Error('ImageKit configuration incomplete. Check environment variables.');
}

console.log('🖼️ ImageKit configuration loaded');
console.log('📍 ImageKit URL:', imagekitUrl);

/**
 * Validate image file before upload
 * @param {File} file - The file to validate
 * @returns {{valid: boolean, message?: string}}
 */
const validateImageFile = (file) => {
  if (!file || !(file instanceof File)) {
    return { valid: false, message: 'Please select a valid file' };
  }

  if (!file.type.startsWith('image/')) {
    return { valid: false, message: 'Please select an image file (JPEG, PNG, GIF, WebP)' };
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return {
      valid: false,
      message: `Image must be smaller than ${Math.round(maxSize / (1024 * 1024))}MB (current: ${Math.round(file.size / (1024 * 1024))}MB)`
    };
  }

  return { valid: true };
};

/**
 * Get authentication parameters from server
 * @returns {Promise<{signature: string, expire: number, token: string}>}
 */
const getAuthParams = async () => {
  console.log('🔐 Getting authentication parameters from server...');

  try {
    const response = await fetch('/api/imagekit-auth', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const authParams = await response.json();

    // Validate required auth parameters
    if (!authParams.signature || !authParams.expire || !authParams.token) {
      throw new Error('Invalid authentication parameters received from server');
    }

    console.log('✅ Authentication parameters received');
    return authParams;

  } catch (error) {
    console.error('❌ Failed to get authentication parameters:', error);
    throw new Error('Failed to initialize secure upload. Please try again.');
  }
};

/**
 * Generate a unique filename for the uploaded image
 * @param {File} file - The original file
 * @param {string} prefix - Filename prefix (e.g., 'profile', 'document')
 * @returns {string} - Unique filename
 */
const generateFileName = (file, prefix = 'upload') => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const extension = file.name.split('.').pop() || 'jpg';

  return `${prefix}_${timestamp}_${randomId}.${extension}`;
};

/**
 * Upload an image to ImageKit with secure authentication
 * @param {File} file - The image file to upload
 * @param {object} options - Upload options
 * @param {string} options.folder - Folder path in ImageKit (optional)
 * @param {string} options.fileName - Custom filename (optional)
 * @param {string} options.prefix - Filename prefix (default: 'upload')
 * @returns {Promise<{success: boolean, url?: string, fileId?: string, message: string}>}
 */
export const uploadImage = async (file, options = {}) => {
  console.log('📤 Starting image upload to ImageKit...');
  console.log('📊 File info:', {
    name: file.name,
    type: file.type,
    size: `${Math.round(file.size / 1024)}KB`
  });

  try {
    // Step 1: Validate the file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      console.log('❌ File validation failed:', validation.message);
      return { success: false, message: validation.message };
    }

    // Step 2: Get authentication parameters from server
    let authParams;
    try {
      authParams = await getAuthParams();
    } catch (error) {
      return { success: false, message: error.message };
    }

    // Step 3: Prepare upload data
    const fileName = options.fileName || generateFileName(file, options.prefix);
    const formData = new FormData();

    formData.append('file', file);
    formData.append('fileName', fileName);
    formData.append('publicKey', imagekitPublicKey);
    formData.append('signature', authParams.signature);
    formData.append('expire', authParams.expire);
    formData.append('token', authParams.token);

    // Add folder if specified
    if (options.folder) {
      formData.append('folder', options.folder);
    }

    console.log('🚀 Uploading to ImageKit...');
    console.log('📍 Target filename:', fileName);

    // Step 4: Upload to ImageKit
    const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      let errorMessage = 'Upload failed';

      try {
        const errorData = await uploadResponse.json();
        console.error('❌ ImageKit upload failed:', errorData);
        errorMessage = errorData.message || `Upload failed with status ${uploadResponse.status}`;
      } catch (parseError) {
        console.error('❌ Failed to parse error response:', parseError);
        errorMessage = `Upload failed with status ${uploadResponse.status}`;
      }

      return {
        success: false,
        message: errorMessage
      };
    }

    const uploadData = await uploadResponse.json();

    console.log('✅ Image uploaded successfully');
    console.log('📍 Image URL:', uploadData.url);
    console.log('🆔 File ID:', uploadData.fileId);

    return {
      success: true,
      url: uploadData.url,
      fileId: uploadData.fileId,
      message: 'Image uploaded successfully'
    };

  } catch (error) {
    console.error('💥 Unexpected error during image upload:', error);
    return {
      success: false,
      message: 'An unexpected error occurred during upload. Please try again.'
    };
  }
};

/**
 * Get optimized image URL with transformations
 * @param {string} originalUrl - Original ImageKit URL
 * @param {object} transformations - ImageKit transformation parameters
 * @param {number} transformations.width - Image width
 * @param {number} transformations.height - Image height
 * @param {string} transformations.crop - Crop mode ('maintain_ratio', 'force', 'at_least', 'at_most')
 * @param {number} transformations.quality - Image quality (1-100)
 * @param {string} transformations.format - Output format ('auto', 'webp', 'jpg', 'png')
 * @returns {string} - Transformed image URL
 */
export const getOptimizedImageUrl = (originalUrl, transformations = {}) => {
  if (!originalUrl || !originalUrl.includes('imagekit.io')) {
    console.warn('⚠️ Invalid ImageKit URL provided');
    return originalUrl;
  }

  const params = [];

  if (transformations.width) params.push(`w-${transformations.width}`);
  if (transformations.height) params.push(`h-${transformations.height}`);
  if (transformations.crop) params.push(`c-${transformations.crop}`);
  if (transformations.quality) params.push(`q-${transformations.quality}`);
  if (transformations.format) params.push(`f-${transformations.format}`);

  if (params.length === 0) {
    return originalUrl;
  }

  // Insert transformations into the URL
  const transformString = `tr:${params.join(',')}`;
  const urlParts = originalUrl.split('/');
  const fileIndex = urlParts.findIndex(part => part.includes('.'));

  if (fileIndex > 0) {
    urlParts.splice(fileIndex, 0, transformString);
    const optimizedUrl = urlParts.join('/');
    console.log('🔧 Generated optimized URL with transformations:', transformString);
    return optimizedUrl;
  }

  return originalUrl;
};

/**
 * Delete an image from ImageKit (requires server-side implementation)
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const deleteImage = async (fileId) => {
  console.log('🗑️ Attempting to delete image:', fileId);

  try {
    if (!fileId) {
      return { success: false, message: 'File ID is required for deletion' };
    }

    // This should be implemented on your server to avoid exposing private API key
    const response = await fetch('/api/imagekit-delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log('✅ Image deleted successfully');
      return { success: true, message: 'Image deleted successfully' };
    } else {
      console.log('❌ Image deletion failed:', result.message);
      return { success: false, message: result.message || 'Failed to delete image' };
    }

  } catch (error) {
    console.error('💥 Error deleting image:', error);
    return { success: false, message: 'Failed to delete image. Please try again.' };
  }
};

console.log('📦 ImageKit module loaded successfully');