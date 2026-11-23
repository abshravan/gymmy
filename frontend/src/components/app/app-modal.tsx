"use client";

import type { FC } from "react";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";

export function AppModal({ open, onClose, title, description, icon, tone = "brand", width = "max-w-lg", children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon?: FC<{ className?: string }>;
  tone?: "brand" | "gray" | "success" | "warning" | "error";
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <ModalOverlay isOpen={open} onOpenChange={(o) => !o && onClose()} isDismissable>
      <Modal className={cx(width)}>
        <Dialog aria-label={title}>
          <div className="relative w-full">
            <CloseButton onClick={onClose} theme="light" size="lg" className="absolute top-3 right-3 z-10" />
            <div className="flex flex-col gap-4 px-4 pt-5 sm:px-6 sm:pt-6">
              {icon && <FeaturedIcon icon={icon} color={tone} theme="light" size="lg" />}
              <div className="pr-8">
                <h2 className="text-lg font-semibold text-primary">{title}</h2>
                {description && <div className="mt-1 text-sm text-tertiary">{description}</div>}
              </div>
            </div>
            <div className="px-4 pt-5 pb-4 sm:px-6 sm:pb-6">{children}</div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function ModalActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("mt-6 flex flex-col-reverse gap-3 sm:grid sm:grid-flow-col sm:auto-cols-fr", className)}>{children}</div>
  );
}
