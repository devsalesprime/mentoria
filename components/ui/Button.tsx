import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'outline';
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, className, ...props }) => {
  const baseStyles = "font-sans font-bold py-4 px-8 rounded-none tracking-wider uppercase text-sm transition-all duration-300";
  
  const variants = {
    primary: "bg-gold-gradient text-prosperus-navy-dark hover:shadow-[0_0_20px_rgba(202,154,67,0.5)]",
    outline: "border border-[#CA9A43] text-[#CA9A43] hover:bg-[#CA9A43] hover:text-[#031A2B]"
  };

  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`${baseStyles} ${variants[variant]} ${className || ''}`}
      {...props}
    >
      {children}
    </motion.button>
  );
};