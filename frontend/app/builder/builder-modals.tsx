"use client";

import Modal from "@/components/modal/page";

export type BuilderErrorItem = {
  elementId: string;
  label: string;
  type: string;
  field: string;
  message: string;
  kind: "node" | "link";
};

type BuilderModalsProps = {
  save: {
    open: boolean;
    leaving: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onDiscard: () => void;
  };
  error: {
    open: boolean;
    title: string;
    items: BuilderErrorItem[];
    general: string[];
    onClose: () => void;
    onItemClick: (item: BuilderErrorItem) => void;
  };
  deletion: {
    open: boolean;
    hasUnsavedChanges: boolean;
    onClose: () => void;
    onConfirm: () => void;
  };
};

export default function BuilderModals({
  save,
  error,
  deletion,
}: BuilderModalsProps) {
  return (
    <>
      <Modal
        open={save.open}
        title="Save changes?"
        onClose={save.onClose}
        className="builder-confirm-modal"
        illustration={
          <div
            className="builder-confirm-art builder-confirm-art--save"
            role="img"
            aria-label="Save illustration"
          />
        }
        actions={
          <>
            <button
              type="button"
              className="builder-confirm-button builder-confirm-button--cancel"
              onClick={save.onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="builder-confirm-button builder-confirm-button--save"
              onClick={save.onConfirm}
            >
              Save
            </button>
          </>
        }
      >
        <p>
          {save.leaving
            ? "Looks like you have some changes waiting to be saved. Save before leaving?"
            : "Save your changes to this schematic?"}
        </p>
        {save.leaving && (
          <button
            type="button"
            className="builder-confirm-discard"
            onClick={save.onDiscard}
          >
            Discard changes and continue
          </button>
        )}
      </Modal>

      <Modal
        open={error.open}
        title={error.title}
        onClose={error.onClose}
        className="builder-confirm-modal builder-feedback-modal"
        actions={
          <button
            type="button"
            className="builder-confirm-button builder-confirm-button--cancel"
            onClick={error.onClose}
          >
            Close
          </button>
        }
      >
        <div className="builder-feedback-content">
          {error.items.length > 0 && (
            <div>
              <h3>Validation errors</h3>
              <ul className="builder-feedback-list">
                {error.items.map((item, index) => (
                  <li key={`${item.elementId}-${item.field}-${index}`}>
                    <button
                      type="button"
                      onClick={() => error.onItemClick(item)}
                    >
                      <strong>
                        {item.label} ({item.type})
                      </strong>{" "}
                      — {item.field}: <span>{item.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error.general.length > 0 && (
            <div>
              {error.items.length > 0 && <h3>Server errors</h3>}
              <ul className="builder-feedback-messages">
                {error.general.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={deletion.open}
        title="Delete file?"
        onClose={deletion.onClose}
        className="builder-confirm-modal"
        illustration={
          <div
            className="builder-confirm-art builder-confirm-art--delete"
            role="img"
            aria-label="Delete illustration"
          />
        }
        actions={
          <>
            <button
              type="button"
              className="builder-confirm-button builder-confirm-button--cancel"
              onClick={deletion.onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="builder-confirm-button builder-confirm-button--delete"
              onClick={deletion.onConfirm}
            >
              Delete
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete this? Once deleted, all your progress
          and data will be permanently lost.
        </p>
        {deletion.hasUnsavedChanges && (
          <p className="builder-delete-warning">
            Warning: You also have unsaved changes that will be lost.
          </p>
        )}
      </Modal>
    </>
  );
}
