// src/js/imagekit.js
// ImageKit client initialization and secure image upload utility

// Validate environment variables
const imagekitUrlEndpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT;
const imagekitPublicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;
const imagekitAuthEndpoint = import.meta.env.VITE_IMAGEKIT_AUTH_ENDPOINT;

if (!imagekitUrlEndpoint || !imagekitPublicKey || !imagekitAuthEndpoint) {
  console.error('❌ Missing ImageKit environment variables');
  throw new Error('ImageKit configuration incomplete. Check .env file.');
}

console.log('🖼️ ImageKit configuration loaded');
console.log('📍 URL Endpoint:', imagekitUrlEndpoint);

/**
 * Validate image file before upload
 */
const validateImageFile = (file) => {
  if (!file || !(file instanceof File)) {
    return { valid: false, message: 'Please select a valid file' };
  }
  if (!file.type.startsWith('image/')) {
    return { valid: false, message: 'Please select an image file (JPEG, PNG, GIF, WebP)' };
  }
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return {
      valid: false,
      message: `Image must be smaller than 5MB (current: ${Math.round(file.size / (1024 * 1024))}MB)`
    };
  }
  return { valid: true };
};

/**
 * Get authentication parameters from backend
 * Requires Supabase JWT in Authorization header
 */
const getAuthParams = async () => {
  try {
    // Retrieve Supabase access token (adjust if you store it differently)
    const token = localStorage.getItem('sb-access-token');

    const response = await fetch(imagekitAuthEndpoint, {
      method: 'POST', // matches backend strict version
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) throw new Error(`Auth endpoint returned ${response.status}`);
    const authParams = await response.json();

    if (!authParams.signature || !authParams.expire || !authParams.token) {
      throw new Error('Invalid authentication parameters received');
    }
    return authParams;
  } catch (error) {
    console.error('❌ Failed to get authentication parameters:', error);
    throw new Error('Failed to initialize secure upload. Please try again.');
  }
};

/**
 * Generate a unique filename
 */
const generateFileName = (file, prefix = 'upload') => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const extension = file.name.split('.').pop() || 'jpg';
  return `${prefix}_${timestamp}_${randomId}.${extension}`;
};

/**
 * Upload an image to ImageKit
 */
export const uploadImage = async (file, options = {}) => {
  const validation = validateImageFile(file);
  if (!validation.valid) return { success: false, message: validation.message };

  try {
    const authParams = await getAuthParams();
    const fileName = options.fileName || generateFileName(file, options.prefix);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', fileName);
    formData.append('publicKey', imagekitPublicKey);
    formData.append('signature', authParams.signature);
    formData.append('expire', authParams.expire);
    formData.append('token', authParams.token);
    if (options.folder) formData.append('folder', options.folder);

    const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      return { success: false, message: errorData.message || `Upload failed with status ${uploadResponse.status}` };
    }

    const uploadData = await uploadResponse.json();
    return { success: true, url: uploadData.url, fileId: uploadData.fileId, message: 'Image uploaded successfully' };
  } catch (error) {
    console.error('💥 Unexpected error during image upload:', error);
    return { success: false, message: error.message || 'Unexpected error during upload' };
  }
};

/**
 * Get optimized image URL with transformations
 */
export const getOptimizedImageUrl = (originalUrl, transformations = {}) => {
  if (!originalUrl || !originalUrl.includes('imagekit.io')) return originalUrl;
  const params = [];
  if (transformations.width) params.push(`w-${transformations.width}`);
  if (transformations.height) params.push(`h-${transformations.height}`);
  if (transformations.crop) params.push(`c-${transformations.crop}`);
  if (transformations.quality) params.push(`q-${transformations.quality}`);
  if (transformations.format) params.push(`f-${transformations.format}`);
  if (!params.length) return originalUrl;
  const transformString = `tr:${params.join(',')}`;
  const urlParts = originalUrl.split('/');
  const fileIndex = urlParts.findIndex(part => part.includes('.'));
  if (fileIndex > 0) {
    urlParts.splice(fileIndex, 0, transformString);
    return urlParts.join('/');
  }
  return originalUrl;
};

/**
 * Delete an image (server-side API required)
 */
export const deleteImage = async (fileId) => {
  if (!fileId) return { success: false, message: 'File ID is required for deletion' };
  try {
    const response = await fetch('/api/imagekit-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId })
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const result = await response.json();
    return result.success
      ? { success: true, message: 'Image deleted successfully' }
      : { success: false, message: result.message || 'Failed to delete image' };
  } catch (error) {
    console.error('💥 Error deleting image:', error);
    return { success: false, message: 'Failed to delete image. Please try again.' };
  }
};

console.log('📦 ImageKit module loaded successfully');
