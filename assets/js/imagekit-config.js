// assets/js/imagekit-config.js
// ImageKit.io configuration and upload utilities

// Initialize ImageKit
const imagekit = new ImageKit({
    publicKey: "public_1rzC7+HYArrie4/eYoI0txq05S4=",
    urlEndpoint: "https://ik.imagekit.io/fwjhcuxnq",
    authenticationEndpoint: "https://your-backend-url.com/auth" // You'll need to set this up
});

// ImageKit utilities
const ImageKitUtils = {
    // Upload image with automatic resizing
    async uploadImage(file, options = {}) {
        return new Promise((resolve, reject) => {
            // Generate a unique filename
            const timestamp = Date.now();
            const fileName = `${timestamp}_${file.name}`;

            const uploadOptions = {
                file: file,
                fileName: fileName,
                folder: options.folder || "/projects", // Organize images in folders
                tags: options.tags || ["project"],
                ...options
            };

            imagekit.upload(uploadOptions, function(error, result) {
                if (error) {
                    console.error('ImageKit upload error:', error);
                    reject(error);
                } else {
                    console.log('ImageKit upload success:', result);
                    resolve(result);
                }
            });
        });
    },

    // Generate optimized URL for display
    generateOptimizedUrl(imagePath, transformations = []) {
        const defaultTransformations = [
            { height: "300", width: "400", crop: "maintain_ratio" },
            { quality: "80" },
            { format: "auto" }
        ];

        return imagekit.url({
            path: imagePath,
            transformation: transformations.length > 0 ? transformations : defaultTransformations
        });
    },

    // Generate thumbnail URL
    generateThumbnailUrl(imagePath) {
        return imagekit.url({
            path: imagePath,
            transformation: [
                { height: "200", width: "300", crop: "maintain_ratio" },
                { quality: "70" },
                { format: "auto" }
            ]
        });
    },

    // Generate high-quality URL for project details
    generateHighQualityUrl(imagePath) {
        return imagekit.url({
            path: imagePath,
            transformation: [
                { height: "600", width: "800", crop: "maintain_ratio" },
                { quality: "90" },
                { format: "auto" }
            ]
        });
    },

    // Validate file before upload
    validateFile(file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!allowedTypes.includes(file.type)) {
            throw new Error('Please upload a valid image file (JPEG, PNG, or WebP)');
        }

        if (file.size > maxSize) {
            throw new Error('File size must be less than 5MB');
        }

        return true;
    },

    // Create file input handler with preview
    createFileInputHandler(inputElement, previewElement, options = {}) {
        inputElement.addEventListener('change', async function(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                // Validate file
                ImageKitUtils.validateFile(file);

                // Show preview
                if (previewElement) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        previewElement.src = e.target.result;
                        previewElement.style.display = 'block';
                    };
                    reader.readAsDataURL(file);
                }

                // Show upload progress
                if (options.onProgress) {
                    options.onProgress('Uploading image...');
                }

                // Upload to ImageKit
                const result = await ImageKitUtils.uploadImage(file, {
                    folder: options.folder || "/projects",
                    tags: options.tags || ["project"]
                });

                // Call success callback
                if (options.onSuccess) {
                    options.onSuccess(result);
                }

            } catch (error) {
                console.error('Upload error:', error);
                if (options.onError) {
                    options.onError(error.message);
                }
            }
        });
    }
};

// Image upload component for forms
class ImageUploadComponent {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            folder: "/projects",
            tags: ["project"],
            showPreview: true,
            allowMultiple: false,
            ...options
        };
        this.uploadedImages = [];
        this.init();
    }

    init() {
        this.createHTML();
        this.attachEventListeners();
    }

    createHTML() {
        this.container.innerHTML = `
            <div class="image-upload-area">
                <input type="file" id="imageInput" accept="image/*" ${this.options.allowMultiple ? 'multiple' : ''} style="display: none;">
                <div class="upload-dropzone" id="dropzone">
                    <div class="upload-icon">📷</div>
                    <p class="upload-text">Click to upload or drag and drop</p>
                    <p class="upload-hint">PNG, JPG, WebP up to 5MB</p>
                </div>
                <div class="image-preview" id="imagePreview" style="display: none;">
                    <img id="previewImage" src="" alt="Preview">
                    <button type="button" class="remove-image" id="removeImage">×</button>
                </div>
                <div class="upload-progress" id="uploadProgress" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <p class="progress-text" id="progressText">Uploading...</p>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const input = this.container.querySelector('#imageInput');
        const dropzone = this.container.querySelector('#dropzone');
        const removeBtn = this.container.querySelector('#removeImage');

        // Click to upload
        dropzone.addEventListener('click', () => input.click());

        // Drag and drop
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0]);
            }
        });

        // File input change
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });

        // Remove image
        removeBtn.addEventListener('click', () => this.removeImage());
    }

    async handleFileUpload(file) {
        try {
            ImageKitUtils.validateFile(file);
            this.showProgress();
            this.showPreview(file);

            const result = await ImageKitUtils.uploadImage(file, {
                folder: this.options.folder,
                tags: this.options.tags
            });

            this.uploadedImages.push(result);
            this.hideProgress();

            // Trigger callback
            if (this.options.onUpload) {
                this.options.onUpload(result);
            }

        } catch (error) {
            this.hideProgress();
            this.showError(error.message);
        }
    }

    showPreview(file) {
        const preview = this.container.querySelector('#imagePreview');
        const img = this.container.querySelector('#previewImage');

        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    showProgress() {
        this.container.querySelector('#uploadProgress').style.display = 'block';
    }

    hideProgress() {
        this.container.querySelector('#uploadProgress').style.display = 'none';
    }

    removeImage() {
        this.container.querySelector('#imagePreview').style.display = 'none';
        this.container.querySelector('#imageInput').value = '';
        this.uploadedImages = [];

        if (this.options.onRemove) {
            this.options.onRemove();
        }
    }

    showError(message) {
        // You can implement error display here
        alert(message); // Simple fallback
    }

    getUploadedImages() {
        return this.uploadedImages;
    }
}

// Make utilities available globally
window.ImageKitUtils = ImageKitUtils;
window.ImageUploadComponent = ImageUploadComponent;