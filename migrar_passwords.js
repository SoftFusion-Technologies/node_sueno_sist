/*
 * Script: migrar_passwords.js
 * Autor: Benjamin Orellana
 * Fecha: 03/08/2025
 * Descripción: Migra todas las contraseñas en texto plano de la tabla usuarios a hash bcrypt.
 */

import bcrypt from 'bcryptjs';
import { UserModel } from './Models/MD_TB_Users.js';

async function migrarPasswords() {
  // Busca todos los usuarios
  const usuarios = await UserModel.findAll();

  for (const user of usuarios) {
    // Verifica si la password YA está encriptada (comienza con $2a$)
    if (user.password && !user.password.startsWith('$2a$')) {
      // Hashea la password
      const hashed = await bcrypt.hash(user.password, 10);

      // Actualiza la password hasheada en la DB
      await UserModel.update({ password: hashed }, { where: { id: user.id } });

      console.log(`Usuario ${user.email} migrado correctamente.`);
    } else {
      console.log(
        `Usuario ${user.email} ya tiene password encriptada, no se modifica.`
      );
    }
  }

  console.log('Migración de passwords finalizada.');
  process.exit(0);
}

// Ejecutar el script
migrarPasswords().catch((err) => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
