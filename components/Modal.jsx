"use client";

import { forwardRef } from "react";

const Modal = forwardRef(function Modal({ title, children, footer, width = 520 }, ref) {
  return (
    <dialog ref={ref} className="modal" style={{ width }}>
      <div className="modal-head no-print">
        <h3>{title}</h3>
        <button type="button" className="icon-x" onClick={() => ref.current?.close()}>
          &times;
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot no-print">{footer}</div>}
    </dialog>
  );
});

export default Modal;