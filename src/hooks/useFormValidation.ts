import { useState, useCallback } from 'react';
import {
  validateEmail,
  validatePasswordStrength,
  isValidCPF,
  isValidCNPJ,
  cleanInput,
  sanitizeInput,
} from '../utils/dataProtection';

export interface ValidationErrors {
  [key: string]: string;
}

export const useFormValidation = () => {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateField = useCallback((name: string, value: string, rules?: ValidationRule[]): string | null => {
    if (!rules || rules.length === 0) return null;

    for (const rule of rules) {
      if (rule.required && (!value || value.trim() === '')) {
        return rule.message || `${name} é obrigatório`;
      }

      if (value && rule.minLength && value.length < rule.minLength) {
        return rule.message || `${name} deve ter pelo menos ${rule.minLength} caracteres`;
      }

      if (value && rule.maxLength && value.length > rule.maxLength) {
        return rule.message || `${name} deve ter no máximo ${rule.maxLength} caracteres`;
      }

      if (value && rule.type === 'email' && !validateEmail(value)) {
        return rule.message || 'Email inválido';
      }

      if (value && rule.type === 'cpf' && !isValidCPF(value)) {
        return rule.message || 'CPF inválido';
      }

      if (value && rule.type === 'cnpj' && !isValidCNPJ(value)) {
        return rule.message || 'CNPJ inválido';
      }

      if (value && rule.type === 'password') {
        const strength = validatePasswordStrength(value);
        if (!strength.isValid) {
          return rule.message || strength.feedback.join(', ');
        }
      }

      if (value && rule.pattern && !rule.pattern.test(value)) {
        return rule.message || `${name} inválido`;
      }
    }

    return null;
  }, []);

  const validateForm = useCallback((fields: Record<string, { value: string; rules?: ValidationRule[] }>): boolean => {
    const newErrors: ValidationErrors = {};

    Object.keys(fields).forEach((name) => {
      const field = fields[name];
      const error = validateField(name, field.value, field.rules);
      if (error) {
        newErrors[name] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [validateField]);

  const setFieldError = useCallback((name: string, message: string) => {
    setErrors((prev) => ({ ...prev, [name]: message }));
  }, []);

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  const sanitizeValue = useCallback((value: string): string => {
    return cleanInput(sanitizeInput(value));
  }, []);

  return {
    errors,
    validateField,
    validateForm,
    setFieldError,
    clearError,
    clearAllErrors,
    sanitizeValue,
  };
};

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  type?: 'email' | 'password' | 'cpf' | 'cnpj' | 'phone';
  pattern?: RegExp;
  message?: string;
}





