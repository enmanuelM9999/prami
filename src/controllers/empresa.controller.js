const express = require("express");
const router = express.Router();

const passport = require("passport");
const pool = require("../database");
const { esEstudiante, esEmpresa } = require("../lib/auth");
const helpers = require("../lib/helpers");
const nodemailer = require("nodemailer");
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const uuid = require('uuid/v4');

// SIGNUP
router.get("/registro", async (req, res) => {
  try {
    const rowsCiudad = await pool.query("SELECT pkIdCiudad, descripcionCiudad FROM ciudad");
    res.render("empresa/registro", { rowsCiudad });
  } catch (error) {
    console.log(error);
  }

});

router.post(
  "/registro",
  passport.authenticate("empresa.registro", {
    successRedirect: "/empresa/index",
    failureRedirect: "/empresa/registro",
    failureFlash: true
  })
);

//SIGNIN
router.get("/login", (req, res) => {
  res.render("empresa/login");
});

router.post("/login", (req, res, next) => {
  req.check("nitEmpresa", "NIT es requerido").notEmpty();
  req.check("password", "Contraseña es requerida").notEmpty();

  const errors = req.validationErrors();
  if (errors.length > 0) {
    req.flash("message", errors[0].msg);
    res.redirect("/empresa/login");
  }
  passport.authenticate("empresa.login", {
    successRedirect: "/empresa/index",
    failureRedirect: "/empresa/login",
    failureFlash: true
  })(req, res, next);
});

router.get("/cerrarLogin", esEmpresa, (req, res) => {
  req.logOut();
  res.redirect("/");
});

router.get("/index", esEmpresa, (req, res) => {
  res.render("empresa/index");
});

router.get('/recuperarClave', (req, res) => {
  res.render('empresa/recuperarClave');
});

router.post('/recuperarClave', async (req, res) => {
  try {
    const { codigo, email } = req.body;
    //Consultar si existe el codigo ingresado en la tabla del Coordinador
    const rowsEmpresa = await pool.query('SELECT fkIdUsuario,correoUsuario FROM empresa INNER JOIN usuario ON usuario.pkIdUsuario = empresa.fkIdUsuario WHERE nitEmpresa = ?', [codigo]);
    //Si la consulta arrojó 1 resultado...
    if (rowsEmpresa.length != 1) {
      throw "Existen varios coordinadores o ninguno asignados a un codigo";
    }
    const empresa = rowsEmpresa[0];
    //Consultar si los correos coinciden
    if (empresa.correoUsuario != email) {
      throw "Los correos no coinciden";
    }
    //Correos coinciden, crear nuvea clave
    const nuevaClave = Math.random().toString(36).substring(7);
    //Actualizar clave
    await pool.query('UPDATE usuario SET claveUsuario = (aes_encrypt("' + nuevaClave + '","' + nuevaClave + '")) WHERE pkIdUsuario=' + empresa.fkIdUsuario + ';');
    //Enviar correo con la clave
    contentHTML = `
          <h1>Empresa, su nueva clave es</h1>
          <p>${nuevaClave}</p>
    
      `;
    //Configurar Emisor
    let transporter = nodemailer.createTransport({
      host: 'mail.lamegaplaza.com',
      port: 587,
      secure: false,
      auth: {
        user: 'prami@lamegaplaza.com',
        pass: 'pramipassprami'
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    //configurar Receptor
    let info = await transporter.sendMail({
      from: '"Prami" <prami@lamegaplaza.com>', // sender address,
      to: email,
      subject: 'Recuperar contraseña',
      // text: 'Contenido'
      html: contentHTML
    })

    console.log('Message sent: %s', info.messageId);
    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

    // Preview only available when sending through an Ethereal account
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...

    req.flash('success', 'Datos enviados, por favor revise su correo electrónico');
    res.redirect('/empresa/index');

  } catch (error) {
    console.log("error recuperando clave: ", error);
    req.flash('message', 'NIT o correo incorrectos');
    res.redirect('/empresa/index');
  }
});

//NEGOCIO
router.get("/crearContrato", esEstudiante, async (req, res) => {
  try {
    //buscar convenios 
    const rowsConvenio = await pool.query("SELECT pkIdConvenio,nombreConvenio FROM convenio");

    //buscar ciudades
    const rowsCiudad = await pool.query("SELECT pkIdCiudad,descripcionCiudad FROM ciudad");

    //enviar datos al gestor de plantilla

    res.render("estudiante/crearContrato", { rowsConvenio, rowsCiudad });
  } catch (error) {
    console.log(error);
  }

});

router.post('/crearContrato', esEstudiante, async (req, res) => {
  try {
    //obtener datos formulario kbron
    const { nitEmpresa, nombreEmpresa, direccionEmpresa, ciudadEmpresa, codConvenio, fechaInicio, fechaFinalizacion } = req.body;
    const fkIdUsuario = req.session.passport.user;
    const rowsEstudiante = await pool.query("SELECT pfkCodigoEstudiante FROM estudiante WHERE fkIdUsuario = ?", [fkIdUsuario]);
    const codEstudiante = rowsEstudiante[0].pfkCodigoEstudiante;
    const fechaActual = new Date();
    const fechaSubida = fechaActual.getFullYear() + "-" + (fechaActual.getMonth() + 1) + "-" + fechaActual.getDate();
    //guardar datos :v

    await pool.query("INSERT INTO contrato (nitEmpresa,nombreEmpresa, fkIdCiudad, direccionEmpresa,fkCodidoEstudiante, fkIdConvenio,fechaInicioPractica,fechaFinPractica,fechaActualizacion) VALUES(?,?,?,?,?,?,?,?,?)", [nitEmpresa, nombreEmpresa, ciudadEmpresa, direccionEmpresa, codEstudiante, codConvenio, fechaInicio, fechaFinalizacion, fechaSubida]);

    //redireccionar vista
    req.flash("success", "Contrato Añadido Correctamente");
    res.redirect('/estudiante/index');

  } catch (error) {
    console.log(error);
  }
});

router.get("/editarPerfil", esEmpresa, async (req, res) => {
  try {
    const idUsuario = req.session.passport.user;
    const rowEmpresa = await pool.query("SELECT empresa.nitEmpresa, empresa.nombreEmpresa, usuario.correoUsuario, usuario.telefonoUsuario, usuario.direccionUsuario, ciudad.descripcionCiudad FROM empresa INNER JOIN usuario ON usuario.pkIdUsuario = empresa.fkIdUsuario INNER JOIN ciudad ON ciudad.pkIdCiudad = empresa.fkIdCiudad WHERE empresa.fkIdUsuario = ?", [idUsuario]);
    const empresa = rowEmpresa[0];
    res.render("empresa/editarPerfil", {empresa});
  } catch (error) {
    console.log(error);
  }
});

router.post("/editarPerfil", esEmpresa, async (req, res) => {
  try {
    const idUsuario = req.session.passport.user;
    const {nit, name, direccion, correo, telefono} = req.body;

    const nuevoUsuario = {correoUsuario: correo, telefonoUsuario: telefono, direccionUsuario: direccion};
    const nuevaEmpresa = {nitEmpresa: nit, nombreEmpresa: name};
    await pool.query("UPDATE usuario SET ? WHERE pkIdUsuario = ?", [nuevoUsuario, idUsuario]);
    await pool.query("UPDATE empresa SET ? WHERE fkIdUsuario = ?", [nuevaEmpresa, idUsuario]);
    req.flash("success", "Datos Actualizados Correctamente");
    res.redirect('/empresa/editarPerfil');
  } catch (error) {
    console.log(error);
  }
});

router.post("/cambiarClave", esEmpresa, async (req, res) => {
  try {
    const { passwordA, passwordN } = req.body;
    const idUsuario = req.session.passport.user;
    //Consultar contraseña actual y comparar con la ingresada

    const rowContra = await pool.query('SELECT CAST(aes_decrypt(claveUsuario,"' + passwordA + '")AS CHAR(200))claveUsuario FROM usuario WHERE pkIdUsuario =' + idUsuario);
    const contraConsulta = rowContra[0].claveUsuario;

    //si es la misma, actualizar en bd
    if (contraConsulta == passwordA) {
      await pool.query(
        'UPDATE usuario SET claveUsuario = (aes_encrypt("' +
        passwordN +
        '","' +
        passwordN +
        '")) WHERE pkIdUsuario=' +
        idUsuario +
        ";"
      );

      req.flash(
        "success",
        "CONTRASEÑA actualizada"
      );
      res.redirect("/empresa/index");
    } else {
      req.flash("message", "CONTRASEÑA incorrecta");
      res.redirect("/empresa/index");
    }

  } catch (error) {
    console.log(error);
    res.redirect("/");
  }
});

router.get("/visualizar", esEmpresa, async (req, res) => {
  try {
    const idUsuario = req.session.passport.user;
    const rowAceptado = await pool.query("SELECT pkIdEmpresa, solicitudAceptada FROM empresa WHERE solicitudAceptada = 1 AND fkIdUsuario = ?", [idUsuario]);

    const rowsDirector = await pool.query("SELECT semestreActual FROM director");
    const semestreUnido = rowsDirector[0].semestreActual;

    const rowsEstudiantes = await pool.query("SELECT usuario.pkIdUsuario,estudiante.pfkCodigoEstudiante, usuario.nombreUsuario, usuario.apellidoUsuario, estudiante.correoInstitucional FROM estudiante INNER JOIN usuario ON usuario.pkIdUsuario = estudiante.fkIdUsuario INNER JOIN estudiantegrupo ON estudiantegrupo.fkCodigoEstudiante = estudiante.pfkCodigoEstudiante INNER JOIN grupo on grupo.pkIdGrupo = estudiantegrupo.fkIdGrupo WHERE estudiante.estaEnPracticas = 0 AND grupo.semestre = ?", [semestreUnido]);
    //console.log(rowsEstudiantes);
    res.render("empresa/visualizar/index", { rowAceptado, rowsEstudiantes });
  } catch (error) {
    console.log(error);
  }

});

router.get('/visualizar/estudiante/:id', esEmpresa, async (req, res) => {
  try {
    const { id } = req.params;

    const rowEstudiante = await pool.query("SELECT usuario.nombreUsuario, usuario.apellidoUsuario, estudiante.pfkCodigoEstudiante, usuario.correoUsuario, estudiante.correoInstitucional, usuario.telefonoUsuario, usuario.direccionUsuario, estudiante.edadEstudiante, estudiante.semestreEstudiante, estudiante.descripcionPersonalizada, estudiante.fkIdHojaVida, usuario.fkIdImg FROM usuario INNER JOIN estudiante ON estudiante.fkIdUsuario = usuario.pkIdUsuario INNER JOIN hojavida ON hojavida.pkIdHojaVida = estudiante.fkIdHojaVida INNER JOIN imagen ON imagen.pkIdImg = usuario.fkIdImg WHERE usuario.pkIdUsuario = ?",[id]);
    //const rowEstudiante = await pool.query("SELECT usuario.nombreUsuario, usuario.apellidoUsuario, estudiante.pfkCodigoEstudiante, usuario.correoUsuario, estudiante.correoInstitucional, usuario.telefonoUsuario, usuario.direccionUsuario, estudiante.edadEstudiante, estudiante.semestreEstudiante, estudiante.descripcionPersonalizada, imagen.rutaImg FROM usuario INNER JOIN estudiante ON estudiante.fkIdUsuario = usuario.pkIdUsuario INNER JOIN imagen ON imagen.pkIdImg = usuario.fkIdImg WHERE usuario.pkIdUsuario = ?", [id]);
    const estudiante = rowEstudiante[0];

    const fkIdHoja = rowEstudiante[0].fkIdHojaVida;
    if (fkIdHoja != undefined) {
      const rowsHoja = await pool.query("SELECT rutaHojaVida FROM hojavida WHERE pkIdHojaVida=?", [fkIdHoja]);
      estudiante.rutaHojaVida = rowsHoja[0].rutaHojaVida;
    }

    const fkIdImg = rowEstudiante[0].fkIdImg;
    if (fkIdImg != undefined) {
      const rowsImg = await pool.query("SELECT rutaImg FROM imagen WHERE pkIdImg=?", [fkIdImg]);
      estudiante.rutaImg = rowsImg[0].rutaImg;
    }
    res.render('empresa/visualizar/estudiante', { estudiante });
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;