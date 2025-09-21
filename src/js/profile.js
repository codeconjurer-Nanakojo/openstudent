// profile.js
import { getProfile, updateProfile, checkProfileCompletion, logout, uploadProfilePictureToImageKit, getUniversities, getPrograms, insertProgram } from '/src/js/supabase.js';

// DOM Elements
const profileForm = document.getElementById('profileForm');
const saveBtn = document.getElementById('saveBtn');
const logoutBtn = document.getElementById('logoutBtn');
const submitLoading = document.getElementById('submitLoading');
const alertSuccess = document.getElementById('alertSuccess');
const alertError = document.getElementById('alertError');
const errorText = document.getElementById('errorText');
const reminderBanner = document.getElementById('reminderBanner');
const reminderText = document.getElementById('reminderText');
const avatarImage = document.getElementById('avatarImage');
const avatarUpload = document.getElementById('avatarUpload');
const customProgramContainer = document.getElementById('customProgramContainer');
const customProgramInput = document.getElementById('customProgramInput');

// Form fields
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const universitySelect = document.getElementById('university');
const programSelect = document.getElementById('program');
const roleInput = document.getElementById('role');

// Track reminder display
const PROFILE_REMINDER_KEY = 'profileReminderShown';
const REMINDER_FREQUENCY = 3; // Show reminder every 3rd page load

// Store current profile data
let currentProfile = null;
let avatarFile = null;

// Form validation
function validateForm() {
    let isValid = true;
    const fullName = fullNameInput.value.trim();
    const university = universitySelect.value;
    const program = programSelect.value;
    const customProgram = programSelect.value === 'other' ? customProgramInput.value.trim() : null;

    // Reset error messages
    document.querySelectorAll('.error-message').forEach(el => {
        el.style.display = 'none';
    });

    // Validate full name
    if (!fullName) {
        document.getElementById('nameError').style.display = 'block';
        isValid = false;
    }

    // Validate university
    if (!university) {
        document.getElementById('universityError').style.display = 'block';
        isValid = false;
    }

    // Validate program
    if (!program) {
        document.getElementById('programError').style.display = 'block';
        isValid = false;
    }

    // Validate custom program if "Other" is selected
    if (program === 'other' && !customProgram) {
        document.getElementById('customProgramError').style.display = 'block';
        isValid = false;
    }

    return isValid;
}

// Check if profile is complete
function isProfileComplete(profile) {
    return profile &&
           profile.full_name &&
           profile.university_id &&
           profile.program_id;
}

// Show reminder banner if needed
function checkAndShowReminder(profile) {
    if (isProfileComplete(profile)) {
        reminderBanner.style.display = 'none';
        return;
    }

    // Check if we should show the reminder
    let reminderCount = parseInt(localStorage.getItem(PROFILE_REMINDER_KEY) || '0');
    reminderCount++;

    if (reminderCount % REMINDER_FREQUENCY === 0) {
        reminderBanner.style.display = 'flex';
        reminderText.textContent = 'Please complete your profile to unlock full contributor features.';
    }

    localStorage.setItem(PROFILE_REMINDER_KEY, reminderCount.toString());
}

// Add "Other" option to programs dropdown
function addOtherOptionToPrograms() {
    const otherOption = document.createElement('option');
    otherOption.value = 'other';
    otherOption.textContent = 'Other (please specify)';
    programSelect.appendChild(otherOption);
}

// Handle program selection change
function setupProgramSelectionHandler() {
    programSelect.addEventListener('change', () => {
        if (programSelect.value === 'other') {
            customProgramContainer.style.display = 'block';
            customProgramInput.setAttribute('required', 'true');
        } else {
            customProgramContainer.style.display = 'none';
            customProgramInput.removeAttribute('required');
        }
    });
}

// Load universities dropdown
async function loadUniversities() {
    try {
        const result = await getUniversities();

        if (result.success) {
            // Clear existing options
            universitySelect.innerHTML = '<option value="">Select your university</option>';

            // Add universities to dropdown
            result.data.forEach(university => {
                const option = document.createElement('option');
                option.value = university.id;
                option.textContent = university.name;
                universitySelect.appendChild(option);
            });

            // Set selected value if user has a university
            if (currentProfile && currentProfile.university_id) {
                universitySelect.value = currentProfile.university_id;
            }
        } else {
            console.error('Failed to load universities:', result.message);
            errorText.textContent = 'Failed to load universities. Please refresh the page.';
            alertError.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading universities:', error);
        errorText.textContent = 'An error occurred while loading universities.';
        alertError.style.display = 'flex';
    }
}

// Load programs dropdown
async function loadPrograms() {
    try {
        const result = await getPrograms();

        if (result.success) {
            // Clear existing options
            programSelect.innerHTML = '<option value="">Select your program</option>';

            // Add programs to dropdown
            result.data.forEach(program => {
                const option = document.createElement('option');
                option.value = program.id;
                option.textContent = program.name;
                programSelect.appendChild(option);
            });

            // Add "Other" option
            addOtherOptionToPrograms();

            // Set selected value if user has a program
            if (currentProfile && currentProfile.program_id) {
                programSelect.value = currentProfile.program_id;
            }
        } else {
            console.error('Failed to load programs:', result.message);
            errorText.textContent = 'Failed to load programs. Please refresh the page.';
            alertError.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading programs:', error);
        errorText.textContent = 'An error occurred while loading programs.';
        alertError.style.display = 'flex';
    }
}

// Handle avatar upload
function setupAvatarUploadHandler() {
    avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            errorText.textContent = 'File size must be less than 5MB';
            alertError.style.display = 'flex';
            return;
        }

        // Validate file type
        if (!file.type.match('image.*')) {
            errorText.textContent = 'Please select an image file';
            alertError.style.display = 'flex';
            return;
        }

        // Store file for later upload
        avatarFile = file;

        // Preview image
        const reader = new FileReader();
        reader.onload = (e) => {
            avatarImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Handle form submission
function setupFormSubmissionHandler() {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        // Show loading state
        saveBtn.disabled = true;
        submitLoading.style.display = 'inline-block';
        alertError.style.display = 'none';

        const fullName = fullNameInput.value.trim();
        const universityId = universitySelect.value;
        let programId = programSelect.value;
        const customProgram = programSelect.value === 'other' ? customProgramInput.value.trim() : null;

        try {
            // Handle custom program if selected
            if (programSelect.value === 'other' && customProgram) {
                console.log('➕ Adding new program:', customProgram);
                const programResult = await insertProgram(customProgram);

                if (programResult.success) {
                    programId = programResult.programId;
                    console.log('✅ New program added with ID:', programId);
                } else {
                    throw new Error(programResult.message);
                }
            }

            // First upload avatar if selected
            let profilePictureUrl = currentProfile?.profile_picture;
            if (avatarFile) {
                console.log('📤 Uploading profile picture...');
                const uploadResult = await uploadProfilePictureToImageKit(avatarFile);

                if (uploadResult.success) {
                    profilePictureUrl = uploadResult.url;
                    console.log('✅ Profile picture uploaded:', profilePictureUrl);
                } else {
                    console.log('❌ Profile picture upload failed:', uploadResult.message);
                    // Continue with profile update even if avatar upload fails
                }
            }

            // Update profile
            console.log('💾 Saving profile...');
            const updateData = {
                full_name: fullName,
                university_id: universityId,
                program_id: programId
            };

            // Only include profile_picture if we have a new URL
            if (profilePictureUrl) {
                updateData.profile_picture = profilePictureUrl;
            }

            const result = await updateProfile(updateData);

            if (result.success) {
                console.log('✅ Profile updated');
                currentProfile = result.profile;

                // Clear avatar file
                avatarFile = null;

                // Show success message
                alertSuccess.style.display = 'flex';

                // Hide reminder banner if profile is now complete
                if (isProfileComplete(result.profile)) {
                    reminderBanner.style.display = 'none';
                }
            } else {
                console.log('❌ Profile update failed:', result.message);
                errorText.textContent = result.message;
                alertError.style.display = 'flex';
            }
        } catch (error) {
            console.error('💥 Unexpected error updating profile:', error);
            errorText.textContent = error.message || 'Failed to update profile. Please try again.';
            alertError.style.display = 'flex';
        } finally {
            // Reset loading state
            saveBtn.disabled = false;
            submitLoading.style.display = 'none';
        }
    });
}

// Handle logout
function setupLogoutHandler() {
    logoutBtn.addEventListener('click', async () => {
        try {
            const result = await logout();

            if (result.success) {
                // Clear any stored profile data
                localStorage.removeItem('userProfile');
                localStorage.removeItem(PROFILE_REMINDER_KEY);

                // Redirect to login page
                window.location.href = 'login.html';
            } else {
                errorText.textContent = result.message;
                alertError.style.display = 'flex';
            }
        } catch (error) {
            console.error('💥 Logout error:', error);
            errorText.textContent = 'Failed to logout. Please try again.';
            alertError.style.display = 'flex';
        }
    });
}

// Load profile data
async function loadProfile() {
    console.log('👤 Fetching profile...');

    try {
        const result = await getProfile();

        if (result.success) {
            console.log('✅ Profile loaded', result.profile);
            currentProfile = result.profile;

            // Populate form fields
            fullNameInput.value = result.profile.full_name || '';
            emailInput.value = result.profile.email || '';
            roleInput.value = result.profile.role || 'contributor';

            // Set avatar if exists
            if (result.profile.profile_picture) {
                avatarImage.src = result.profile.profile_picture;
            }

            // Load dropdowns
            await loadUniversities();
            await loadPrograms();

            // Check if we need to show the reminder banner
            checkAndShowReminder(result.profile);
        } else {
            console.log('❌ Failed to load profile:', result.message);
            errorText.textContent = result.message;
            alertError.style.display = 'flex';
        }
    } catch (error) {
        console.error('💥 Unexpected error loading profile:', error);
        errorText.textContent = 'Failed to load profile. Please try again.';
        alertError.style.display = 'flex';
    }
}

// Initialize the page
function initProfilePage() {
    // Set up event handlers
    setupProgramSelectionHandler();
    setupAvatarUploadHandler();
    setupFormSubmissionHandler();
    setupLogoutHandler();

    // Load profile data
    loadProfile();
}

// Start when DOM is loaded
document.addEventListener('DOMContentLoaded', initProfilePage);