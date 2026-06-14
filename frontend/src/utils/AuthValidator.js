// utils/AuthValidator.js

export const validateAuth = (password) => {
    // Kurallar: En az 8 karakter, 1 Büyük Harf, 1 Küçük Harf, 1 Rakam, 1 Özel Karakter
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    let errors = [];

    if (password.length < minLength) errors.push(`En az ${minLength} karakter olmalıdır.`);
    if (!hasUpperCase) errors.push("En az 1 büyük harf içermelidir.");
    if (!hasLowerCase) errors.push("En az 1 küçük harf içermelidir.");
    if (!hasNumbers) errors.push("En az 1 rakam içermelidir.");
    if (!hasSpecialChar) errors.push("En az 1 özel karakter içermelidir.");

    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

export const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
